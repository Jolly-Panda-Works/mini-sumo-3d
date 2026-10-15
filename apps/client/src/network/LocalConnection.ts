import {
  ClientMessage,
  ServerMessage,
  type Phase,
  type SyncedPlayer,
  type SyncedState,
} from "@mini-sumo/shared";
import { GameSession, createConfig, isDashing, type ActionResult } from "@mini-sumo/sim";
import type { GameConnection } from "./connection";

/** Offline quick match: a short, natural-feeling "search" before bots fill the room. */
const OFFLINE_SEARCH_MS = 4000;
const TICK_MS = 1000 / 30;
const roundUp100 = (ms: number) => Math.ceil(ms / 100) * 100;

interface LocalState extends SyncedState {
  players: Map<string, SyncedPlayer>;
  standings: string[];
}

function randomCode(length = 9): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export interface LocalRoomOptions {
  name: string;
  appearance: unknown;
  isPrivate: boolean;
  maxPlayers: number;
}

/**
 * Offline mode: runs the same authoritative GameSession the server uses, inside the
 * browser, with bots as opponents. Used while no online server is available.
 */
export class LocalConnection implements GameConnection {
  readonly roomId = `offline-${randomCode(6)}`;
  readonly sessionId = randomCode();
  readonly offline = true;
  readonly state: LocalState;

  private readonly session: GameSession;
  private readonly isPrivate: boolean;
  private timer = 0;
  private lastTick = 0;
  private stateListeners = new Set<() => void>();
  private messageListeners = new Map<string, Set<(message: any) => void>>();

  constructor(options: LocalRoomOptions) {
    this.isPrivate = options.isPrivate;
    this.session = new GameSession(createConfig({ quickMatchWaitMs: OFFLINE_SEARCH_MS }), options.maxPlayers, {
      quickMatch: !options.isPrivate,
    });
    this.state = {
      players: new Map(),
      phase: "waiting" as Phase,
      phaseRemainingMs: 0,
      hostId: "",
      winnerId: "",
      isDraw: false,
      round: 0,
      maxPlayers: this.session.maxPlayers,
      isPrivate: options.isPrivate,
      aliveCount: 0,
      searchRemainingMs: 0,
      standings: [],
    };
    this.session.addPlayer(this.sessionId, options.name, options.appearance);
    this.sync();
    this.lastTick = performance.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  send(type: string, message?: unknown): void {
    const id = this.sessionId;
    const s = this.session;
    let result: ActionResult | null = null;
    switch (type) {
      case ClientMessage.Input:
        s.handleInput(id, message);
        return;
      case ClientMessage.Dash:
        s.handleDash(id);
        break;
      case ClientMessage.StartMatch:
        result = s.requestStart(id);
        break;
      case ClientMessage.Rematch:
        result = s.requestRematch(id);
        break;
      case ClientMessage.ReturnToLobby:
        result = s.requestReturnToLobby(id);
        break;
      case ClientMessage.SetAppearance:
        result = s.setAppearance(id, message);
        break;
      case ClientMessage.AddBot:
        result = s.addBot(id);
        break;
      case ClientMessage.RemoveBot: {
        const botId = typeof message === "object" && message !== null ? (message as Record<string, unknown>).id : undefined;
        result = s.removeBot(id, botId);
        break;
      }
      default:
        return;
    }
    if (result && !result.ok) this.emit(ServerMessage.Error, { message: result.error });
    this.flush();
  }

  onStateChange(callback: () => void): void {
    this.stateListeners.add(callback);
  }

  onMessage(type: string, callback: (message: any) => void): void {
    let set = this.messageListeners.get(type);
    if (!set) {
      set = new Set();
      this.messageListeners.set(type, set);
    }
    set.add(callback);
  }

  onError(): void {
    // Local rooms don't have transport errors.
  }

  onLeave(): void {
    // Local rooms only end when the player leaves.
  }

  removeAllListeners(): void {
    this.stateListeners.clear();
    this.messageListeners.clear();
  }

  async leave(): Promise<number> {
    window.clearInterval(this.timer);
    this.removeAllListeners();
    return 1000;
  }

  // ------------------------------------------------------------------ internals

  private tick(): void {
    const now = performance.now();
    this.session.update(now - this.lastTick);
    this.lastTick = now;
    this.flush();
  }

  private flush(): void {
    for (const event of this.session.drainEvents()) {
      switch (event.type) {
        case "impact":
          this.emit(ServerMessage.Impact, {
            a: event.a,
            b: event.b,
            x: event.x,
            y: event.y,
            strength: Math.round(event.strength * 10) / 10,
          });
          break;
        case "eliminated":
          this.emit(ServerMessage.Eliminated, { sessionId: event.id, name: event.name, reason: event.reason });
          break;
        case "dash":
          this.emit(ServerMessage.Dash, { sessionId: event.id });
          break;
        default:
          break;
      }
    }
    this.sync();
    this.stateListeners.forEach((listener) => listener());
  }

  private emit(type: string, message: unknown): void {
    this.messageListeners.get(type)?.forEach((listener) => listener(message));
  }

  /** Mirrors MiniSumoRoom.syncState for the local session. */
  private sync(): void {
    const s = this.session;
    const state = this.state;
    state.phase = s.phase;
    state.phaseRemainingMs = roundUp100(s.phaseRemainingMs);
    state.hostId = s.hostId;
    state.winnerId = s.winnerId;
    state.isDraw = s.isDraw;
    state.round = s.round;
    state.aliveCount = s.alivePlayers.length;
    state.searchRemainingMs = roundUp100(s.searchRemainingMs);
    state.standings = [...s.standings];

    for (const id of [...state.players.keys()]) if (!s.players.has(id)) state.players.delete(id);
    for (const [id, p] of s.players) {
      let ps = state.players.get(id);
      if (!ps) {
        ps = { sessionId: id } as SyncedPlayer;
        state.players.set(id, ps);
      }
      ps.name = p.name;
      ps.colorIndex = p.colorIndex;
      ps.x = p.x;
      ps.y = p.y;
      ps.vx = p.vx;
      ps.vy = p.vy;
      ps.angle = p.angle;
      ps.alive = p.alive;
      ps.connected = p.connected;
      ps.dashing = isDashing(p, s.time);
      ps.dashCooldownMs = roundUp100(Math.max(0, p.dashReadyAt - s.time));
      ps.placement = p.placement;
      ps.elimReason = p.elimReason;
      ps.isBot = p.isBot && this.isPrivate;
      ps.hair = p.appearance.hair;
      ps.hairColor = p.appearance.hairColor;
      ps.face = p.appearance.face;
      ps.outfit = p.appearance.outfit;
    }
  }
}
