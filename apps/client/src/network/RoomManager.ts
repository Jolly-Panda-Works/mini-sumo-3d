import { Client, type Room } from "colyseus.js";
import {
  ClientMessage,
  Phase,
  ROOM_NAME,
  ServerMessage,
  type DashPayload,
  type EliminatedPayload,
  type ErrorPayload,
  type ImpactPayload,
  type JoinOptions,
  type SyncedState,
} from "@mini-sumo/shared";
import { audio } from "../audio/AudioManager";
import { resolveServerUrl } from "../config";
import { dustBus, impactBus, lastHitAt, shakeBus } from "../game/effectsBus";
import { createStore } from "../store";
import { pushToast } from "../uiStore";

export type ConnectionStatus = "idle" | "connecting" | "connected";

export interface UIPlayer {
  id: string;
  name: string;
  colorIndex: number;
  alive: boolean;
  connected: boolean;
  placement: number;
  elimReason: string;
  dashCooldownMs: number;
  isHost: boolean;
  isYou: boolean;
}

/** Low-frequency snapshot for React UI. The 3D scene reads the live room state directly. */
export interface GameSnapshot {
  phase: Phase;
  remainingMs: number;
  hostId: string;
  winnerId: string;
  isDraw: boolean;
  round: number;
  maxPlayers: number;
  isPrivate: boolean;
  aliveCount: number;
  players: UIPlayer[];
  standings: string[];
}

export interface SessionInfo {
  status: ConnectionStatus;
  roomId: string;
  sessionId: string;
  error: string | null;
  /** True when no state patch has arrived for a while during a match. */
  unstable: boolean;
}

const EMPTY_GAME: GameSnapshot = {
  phase: Phase.Waiting,
  remainingMs: 0,
  hostId: "",
  winnerId: "",
  isDraw: false,
  round: 0,
  maxPlayers: 4,
  isPrivate: false,
  aliveCount: 0,
  players: [],
  standings: [],
};

export const sessionStore = createStore<SessionInfo>({
  status: "idle",
  roomId: "",
  sessionId: "",
  error: null,
  unstable: false,
});

export const gameStore = createStore<GameSnapshot>(EMPTY_GAME);

const ROOM_CODE_PATTERN = /^[A-Za-z0-9_-]{4,40}$/;

function friendlyError(error: unknown, serverUrl: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = raw.toLowerCase();
  if (message.includes("not found") || message.includes("invalid room")) {
    return "That room doesn't exist anymore. Check the code or ask for a new invite.";
  }
  if (message.includes("locked") || message.includes("full")) {
    return "That room is full or a match is already running.";
  }
  if (raw && !message.includes("fetch") && !message.includes("network") && !message.includes("xmlhttprequest") && !message.includes("econnrefused")) {
    return raw;
  }
  return `Can't reach the game server at ${serverUrl}. Make sure it is running.`;
}

class RoomManager {
  readonly serverUrl = resolveServerUrl();
  private client = new Client(this.serverUrl);
  private _room: Room | null = null;
  private snapshotKey = "";
  private lastPatchAt = 0;
  private lastCountdownSecond = -1;
  private watchdog = 0;

  get room(): Room | null {
    return this._room;
  }

  /** Live synchronized state (mutated in place by Colyseus). */
  get state(): SyncedState | null {
    return (this._room?.state as SyncedState | undefined) ?? null;
  }

  get sessionId(): string {
    return this._room?.sessionId ?? "";
  }

  quickPlay(name: string): Promise<boolean> {
    const options: JoinOptions = { name, private: false, maxPlayers: 4 };
    return this.connect(() => this.client.joinOrCreate(ROOM_NAME, options));
  }

  createPrivate(name: string, maxPlayers: number): Promise<boolean> {
    const options: JoinOptions = { name, private: true, maxPlayers };
    return this.connect(() => this.client.create(ROOM_NAME, options));
  }

  joinByCode(code: string, name: string): Promise<boolean> {
    const trimmed = code.trim();
    if (!ROOM_CODE_PATTERN.test(trimmed)) {
      sessionStore.update({ error: "Room codes are letters and numbers. Paste the code or open the invite link." });
      return Promise.resolve(false);
    }
    const options: JoinOptions = { name };
    return this.connect(() => this.client.joinById(trimmed, options));
  }

  async leave(): Promise<void> {
    const room = this._room;
    this.detach();
    sessionStore.set({ status: "idle", roomId: "", sessionId: "", error: null, unstable: false });
    if (room) {
      try {
        await room.leave(true);
      } catch {
        // Already disconnected.
      }
    }
  }

  sendInput(x: number, y: number): void {
    this._room?.send(ClientMessage.Input, { x, y });
  }

  dash(): void {
    this._room?.send(ClientMessage.Dash);
  }

  startMatch(): void {
    this._room?.send(ClientMessage.StartMatch);
  }

  rematch(): void {
    this._room?.send(ClientMessage.Rematch);
  }

  returnToLobby(): void {
    this._room?.send(ClientMessage.ReturnToLobby);
  }

  /**
   * Shareable link. Desktop/Android builds run from a local origin, so they use the
   * public web address from VITE_PUBLIC_URL (e.g. the GitHub Pages URL) instead.
   */
  inviteLink(): string {
    const publicUrl = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim();
    const url = new URL(publicUrl || window.location.href);
    url.search = "";
    url.hash = "";
    if (this._room) url.searchParams.set("room", this._room.roomId);
    return url.toString();
  }

  // ------------------------------------------------------------------ internals

  private async connect(join: () => Promise<Room>): Promise<boolean> {
    if (sessionStore.get().status === "connecting") return false;
    if (this._room) await this.leave();
    sessionStore.update({ status: "connecting", error: null });
    try {
      const room = await join();
      this.attach(room);
      return true;
    } catch (error) {
      sessionStore.update({ status: "idle", error: friendlyError(error, this.serverUrl) });
      return false;
    }
  }

  private attach(room: Room): void {
    this._room = room;
    this.snapshotKey = "";
    this.lastPatchAt = performance.now();
    this.lastCountdownSecond = -1;
    sessionStore.set({ status: "connected", roomId: room.roomId, sessionId: room.sessionId, error: null, unstable: false });

    const url = new URL(window.location.href);
    url.searchParams.set("room", room.roomId);
    window.history.replaceState(null, "", url.toString());

    room.onStateChange(() => {
      this.lastPatchAt = performance.now();
      this.refreshSnapshot();
    });

    room.onMessage(ServerMessage.Impact, (msg: ImpactPayload) => {
      const now = performance.now();
      lastHitAt.set(msg.a, now);
      lastHitAt.set(msg.b, now);
      impactBus.emit({ x: msg.x, y: msg.y, strength: msg.strength });
      dustBus.emit({ x: msg.x, y: msg.y, count: Math.min(14, 4 + Math.round(msg.strength)), speed: 1 + msg.strength * 0.25 });
      if (msg.strength > 6) shakeBus.emit(Math.min(1, msg.strength / 14));
      audio.impact(msg.strength);
    });

    room.onMessage(ServerMessage.Dash, (msg: DashPayload) => {
      const player = this.state?.players.get(msg.sessionId);
      if (player) dustBus.emit({ x: player.x, y: player.y, count: 6, speed: 1.2 });
      audio.dash();
    });

    room.onMessage(ServerMessage.Eliminated, (msg: EliminatedPayload) => {
      const isYou = msg.sessionId === this.sessionId;
      const text =
        msg.reason === "left"
          ? `${msg.name} left the bout`
          : isYou
            ? "You were pushed out of the ring"
            : `${msg.name} is out of the ring`;
      pushToast(text, "out");
      const player = this.state?.players.get(msg.sessionId);
      if (player && msg.reason === "ringOut") {
        dustBus.emit({ x: player.x, y: player.y, count: 16, speed: 2.4 });
        shakeBus.emit(0.7);
      }
      audio.eliminated();
    });

    room.onMessage(ServerMessage.Error, (msg: ErrorPayload) => {
      if (msg && typeof msg.message === "string") pushToast(msg.message, "error");
    });

    room.onError((code, message) => {
      console.warn("[mini-sumo] room error", code, message);
    });

    room.onLeave((code) => {
      if (this._room !== room) return; // we left on purpose
      this.detach();
      // 1000 = normal closure, 4000 = Colyseus "consented" close.
      const consented = code === 1000 || code === 4000;
      sessionStore.set({
        status: "idle",
        roomId: "",
        sessionId: "",
        unstable: false,
        error: consented ? null : "You lost the connection to the room. Rejoin with the invite link or start a new game.",
      });
    });

    window.clearInterval(this.watchdog);
    this.watchdog = window.setInterval(() => {
      const phase = gameStore.get().phase;
      const active = phase === Phase.Countdown || phase === Phase.Playing;
      const unstable = active && performance.now() - this.lastPatchAt > 1500;
      if (unstable !== sessionStore.get().unstable) sessionStore.update({ unstable });
    }, 500);

    this.refreshSnapshot();
  }

  private detach(): void {
    window.clearInterval(this.watchdog);
    this._room?.removeAllListeners();
    this._room = null;
    this.snapshotKey = "";
    gameStore.set(EMPTY_GAME);
    const url = new URL(window.location.href);
    if (url.searchParams.has("room")) {
      url.searchParams.delete("room");
      window.history.replaceState(null, "", url.toString());
    }
  }

  private refreshSnapshot(): void {
    const state = this.state;
    if (!state || !state.players) return;
    const you = this.sessionId;

    const players: UIPlayer[] = [];
    state.players.forEach((p, id) => {
      players.push({
        id,
        name: p.name,
        colorIndex: p.colorIndex,
        alive: p.alive,
        connected: p.connected,
        placement: p.placement,
        elimReason: p.elimReason,
        dashCooldownMs: p.dashCooldownMs,
        isHost: id === state.hostId,
        isYou: id === you,
      });
    });
    players.sort((a, b) => a.colorIndex - b.colorIndex);

    const next: GameSnapshot = {
      phase: state.phase,
      remainingMs: state.phaseRemainingMs,
      hostId: state.hostId,
      winnerId: state.winnerId,
      isDraw: state.isDraw,
      round: state.round,
      maxPlayers: state.maxPlayers,
      isPrivate: state.isPrivate,
      aliveCount: state.aliveCount,
      players,
      standings: Array.from(state.standings ?? []),
    };

    const key = JSON.stringify(next);
    if (key === this.snapshotKey) return;
    this.snapshotKey = key;
    const previous = gameStore.get();
    gameStore.set(next);
    this.playPhaseCues(previous, next);
  }

  private playPhaseCues(prev: GameSnapshot, next: GameSnapshot): void {
    if (next.phase === Phase.Countdown) {
      const second = Math.ceil(next.remainingMs / 1000);
      if (second !== this.lastCountdownSecond && second > 0) {
        this.lastCountdownSecond = second;
        audio.countdown();
      }
    } else {
      this.lastCountdownSecond = -1;
    }
    if (prev.phase !== next.phase) {
      if (next.phase === Phase.Playing) audio.go();
      if (next.phase === Phase.RoundOver) {
        if (next.winnerId && next.winnerId === this.sessionId) audio.victory();
        else audio.roundEnd();
      }
    }
  }
}

export const roomManager = new RoomManager();
