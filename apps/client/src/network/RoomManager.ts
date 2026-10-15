import { Client } from "colyseus.js";
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
  type RemoveBotPayload,
  type EconomyResultMessage,
  type SyncedState,
  type Appearance,
} from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { wrapColyseusRoom, type GameConnection } from "./connection";
import { LocalConnection, type LocalRoomOptions } from "./LocalConnection";
import { detectNetworkMode, networkStore } from "./networkMode";
import { accountToken, economyStore, ensureAccount, loadEconomy, refreshProfile, setLastResult } from "./economyClient";
import { audio } from "../audio/AudioManager";
import { resolveServerUrl } from "../config";
import { dustBus, impactBus, lastHitAt, shakeBus } from "../game/effectsBus";
import { createStore } from "../store";
import { pushToast } from "../uiStore";
import { vibrate } from "../haptics";

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
  /** Only true in private rooms; quick-match bots look like everyone else. */
  isBot: boolean;
  appearance: Appearance;
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
  /** Quick match: ms until opponents are filled in (0 when not searching). */
  searchRemainingMs: number;
  arenaId: string;
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
  searchRemainingMs: 0,
  arenaId: "training",
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
  if (/room is locked|room is full|is full|match is in progress|maxclients/.test(message)) {
    return "That room is full or a match is already running.";
  }
  if (raw && !message.includes("fetch") && !message.includes("network") && !message.includes("xmlhttprequest") && !message.includes("econnrefused")) {
    return raw;
  }
  return `Can't reach the game server at ${serverUrl}. Make sure it is running.`;
}

/** Errors that mean "no server reachable" (as opposed to a refusal from a running server). */
function isUnreachable(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = raw.toLowerCase();
  return !raw || /fetch|network|xmlhttprequest|econnrefused|failed to|load failed|timeout|offline/.test(message);
}

class RoomManager {
  readonly serverUrl = resolveServerUrl();
  private client = new Client(this.serverUrl);
  private _room: GameConnection | null = null;
  private modeReady: Promise<void>;

  constructor() {
    this.modeReady = detectNetworkMode(this.serverUrl).then((mode) => {
      networkStore.set({ mode });
      if (mode === "offline") console.info("[mini-sumo] No server: rooms run on this device.");
      else void loadEconomy();
    });
  }

  /** True when rooms run locally against bots (no online server yet). */
  get offline(): boolean {
    return networkStore.get().mode === "offline";
  }
  private snapshotKey = "";
  private lastPatchAt = 0;
  private lastCountdownSecond = -1;
  private watchdog = 0;

  get room(): GameConnection | null {
    return this._room;
  }

  /** Live synchronized state (mutated in place by Colyseus). */
  get state(): SyncedState | null {
    return (this._room?.state as SyncedState | undefined) ?? null;
  }

  get sessionId(): string {
    return this._room?.sessionId ?? "";
  }

  /** Free training arena: quick match, bots fill in (offline: a local bot room). */
  quickPlay(name: string): Promise<boolean> {
    return this.enterArena("training", name);
  }

  /**
   * Joins an arena's matchmaking. Paid arenas charge the entry fee on the server when the
   * room accepts you; they need the online server.
   */
  async enterArena(arenaId: string, name: string): Promise<boolean> {
    const appearance = settingsStore.get().appearance;
    await this.modeReady;
    if (arenaId !== "training" && this.offline) {
      sessionStore.update({ error: "This arena is coming soon. Try Training meanwhile." });
      return false;
    }
    const options: JoinOptions = { name, private: false, maxPlayers: 4, appearance, arenaId };
    return this.connect(
      async () => {
        options.authToken = await this.authToken();
        return wrapColyseusRoom(await this.client.joinOrCreate(ROOM_NAME, options));
      },
      arenaId === "training" ? { name, appearance, isPrivate: false, maxPlayers: 4 } : undefined,
    );
  }

  /** Guest token for the economy (created on first online use). */
  private async authToken(): Promise<string | undefined> {
    const catalog = economyStore.get().catalog;
    if (catalog && !catalog.flags.economy) return undefined;
    try {
      return (await ensureAccount()).token;
    } catch {
      return accountToken();
    }
  }

  createPrivate(name: string, maxPlayers: number): Promise<boolean> {
    const appearance = settingsStore.get().appearance;
    const options: JoinOptions = { name, private: true, maxPlayers, appearance, arenaId: "private" };
    return this.connect(
      async () => {
        options.authToken = await this.authToken();
        return wrapColyseusRoom(await this.client.create(ROOM_NAME, options));
      },
      { name, appearance, isPrivate: true, maxPlayers },
    );
  }

  joinByCode(code: string, name: string): Promise<boolean> {
    const trimmed = code.trim();
    if (!ROOM_CODE_PATTERN.test(trimmed)) {
      sessionStore.update({ error: "Room codes are letters and numbers. Paste the code or open the invite link." });
      return Promise.resolve(false);
    }
    if (this.offline) {
      sessionStore.update({ error: "Playing with friends is coming soon." });
      return Promise.resolve(false);
    }
    const options: JoinOptions = { name, appearance: settingsStore.get().appearance };
    return this.connect(async () => {
      options.authToken = await this.authToken();
      return wrapColyseusRoom(await this.client.joinById(trimmed, options));
    });
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

  /** Sends the current look to the room (the server only accepts it in the lobby). */
  setAppearance(appearance: Appearance): void {
    this._room?.send(ClientMessage.SetAppearance, appearance);
  }

  addBot(): void {
    this._room?.send(ClientMessage.AddBot);
  }

  removeBot(id: string): void {
    const payload: RemoveBotPayload = { id };
    this._room?.send(ClientMessage.RemoveBot, payload);
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

  /**
   * Joins online, or creates a local bot room when offline. If the server turns out to be
   * unreachable while joining and an offline fallback is possible, switches to offline mode.
   */
  private async connect(join: () => Promise<GameConnection>, offlineRoom?: LocalRoomOptions): Promise<boolean> {
    if (sessionStore.get().status === "connecting") return false;
    if (this._room) await this.leave();
    sessionStore.update({ status: "connecting", error: null });
    await this.modeReady;

    if (this.offline && offlineRoom) {
      this.attach(new LocalConnection(offlineRoom));
      return true;
    }
    try {
      this.attach(await join());
      return true;
    } catch (error) {
      console.error("[mini-sumo] join failed", error);
      if (offlineRoom && isUnreachable(error) && String(import.meta.env.VITE_NETWORK_MODE ?? "auto") !== "online") {
        networkStore.set({ mode: "offline" });
        this.attach(new LocalConnection(offlineRoom));
        return true;
      }
      sessionStore.update({ status: "idle", error: friendlyError(error, this.serverUrl) });
      return false;
    }
  }

  private attach(room: GameConnection): void {
    this._room = room;
    // Make sure the server has the latest look, even if it changed while joining.
    room.send(ClientMessage.SetAppearance, settingsStore.get().appearance);
    this.snapshotKey = "";
    this.lastPatchAt = performance.now();
    this.lastCountdownSecond = -1;
    sessionStore.set({ status: "connected", roomId: room.roomId, sessionId: room.sessionId, error: null, unstable: false });
    setLastResult(null);
    // The entry fee (if any) was charged when the room accepted us.
    if (!room.offline) void refreshProfile();

    if (!room.offline) {
      const url = new URL(window.location.href);
      url.searchParams.set("room", room.roomId);
      window.history.replaceState(null, "", url.toString());
    }

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
      if (msg.a === this.sessionId || msg.b === this.sessionId) vibrate(Math.min(60, 15 + Math.round(msg.strength * 4)));
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
      if (isYou) vibrate(120);
    });

    room.onMessage(ServerMessage.Economy, (msg: EconomyResultMessage) => {
      setLastResult(msg);
      if (msg.kind === "cancelled") pushToast(msg.note, "info", 4000);
      void refreshProfile();
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
        isBot: Boolean(p.isBot),
        appearance: { hair: p.hair ?? 0, hairColor: p.hairColor ?? 0, face: p.face ?? 0, outfit: p.outfit ?? 0 },
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
      searchRemainingMs: state.searchRemainingMs ?? 0,
      arenaId: state.arenaId ?? "training",
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
