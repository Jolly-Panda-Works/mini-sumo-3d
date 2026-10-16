import {
  ClientMessage,
  ServerMessage,
  sanitizeBotLevel,
  type Phase,
  type SyncedPlayer,
  type SyncedState,
} from "@mini-sumo/shared";
import { GameSession, createConfig, isDashing, type ActionResult } from "@mini-sumo/sim";
import type { GameConnection } from "./connection";
import { localEconomy, type LocalEntry } from "./localEconomy";

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
  botLevel: string;
  /** Arena of this local room (training, rookie, pro, champion; private rooms have none). */
  arenaId?: string;
  /** Paid entry (local economy). Refunded if the bout never starts. */
  entry?: LocalEntry;
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
  private leaveListeners = new Set<(code: number) => void>();
  private readonly arenaId: string;
  private readonly entry: LocalEntry | null;
  private lastPhase: string = "waiting";
  /** Opponents you pushed out this round. */
  private ringOuts = 0;
  private closed = false;
  private messageListeners = new Map<string, Set<(message: any) => void>>();

  constructor(options: LocalRoomOptions) {
    this.isPrivate = options.isPrivate;
    this.arenaId = options.isPrivate ? "private" : (options.arenaId ?? "training");
    // Every local arena bout (free or paid) goes through the local economy, except private rooms.
    this.entry = options.entry ?? (options.isPrivate ? null : { id: randomCode(), arenaId: this.arenaId, fee: 0, status: "paid" });
    this.session = new GameSession(createConfig({ quickMatchWaitMs: OFFLINE_SEARCH_MS }), options.maxPlayers, {
      quickMatch: !options.isPrivate,
      botLevel: sanitizeBotLevel(options.botLevel),
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
      arenaId: this.arenaId,
      botLevel: sanitizeBotLevel(options.botLevel),
      itemKind: "",
      itemX: 0,
      itemY: 0,
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

  onLeave(callback: (code: number) => void): void {
    this.leaveListeners.add(callback);
  }

  removeAllListeners(): void {
    this.stateListeners.clear();
    this.messageListeners.clear();
    this.leaveListeners.clear();
  }

  async leave(): Promise<number> {
    this.stop();
    this.removeAllListeners();
    return 1000;
  }

  private stop(): void {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.timer);
    // Leaving before the bout started gives the entry fee back.
    if (this.entry) localEconomy.refundIfNotStarted(this.entry);
  }

  /** Paid local bouts are single rounds: after the results the room closes (back home). */
  private close(): void {
    this.stop();
    this.leaveListeners.forEach((listener) => listener(4000));
    this.removeAllListeners();
  }

  private get paid(): boolean {
    return (this.entry?.fee ?? 0) > 0;
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
          if (event.by === this.sessionId) this.ringOuts++;
          this.emit(ServerMessage.Eliminated, { sessionId: event.id, name: event.name, reason: event.reason, by: event.by });
          break;
        case "dash":
          this.emit(ServerMessage.Dash, { sessionId: event.id });
          break;
        case "phase":
          if (event.to === "playing" && this.entry) localEconomy.lock(this.entry);
          if (event.to === "countdown") this.ringOuts = 0;
          break;
        case "roundOver":
          this.settle(event.winnerId, event.draw, event.durationMs);
          break;
        default:
          break;
      }
    }
    this.sync();
    this.stateListeners.forEach((listener) => listener());
    const phase = this.session.phase;
    if (this.paid && this.lastPhase === "roundOver" && phase !== "roundOver") {
      this.lastPhase = phase;
      this.close();
      return;
    }
    this.lastPhase = phase;
  }

  /** Prize or rewards plus XP for the bout that just ended (once per round). */
  private settle(winnerId: string | null, draw: boolean, durationMs: number): void {
    if (!this.entry) return;
    const result = localEconomy.finish(this.entry, {
      matchId: `${this.roomId}:${this.session.round}`,
      won: winnerId === this.sessionId,
      draw,
      completed: true,
      durationMs,
      players: this.session.players.size,
      ringOuts: this.ringOuts,
    });
    this.emit(ServerMessage.Economy, result);
    // Training rematches: each round is a fresh (free) entry.
    if (!this.paid) this.entry.status = "paid";
  }

  private emit(type: string, message: unknown): void {
    this.messageListeners.get(type)?.forEach((listener) => listener(message));
  }

  /** Mirrors MiniSumoRoom.syncState for the local session. */
  private sync(): void {
    const s = this.session;
    const state = this.state;
    state.phase = s.phase;
    state.itemKind = s.item?.kind ?? "";
    state.itemX = s.item?.x ?? 0;
    state.itemY = s.item?.y ?? 0;
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
      ps.dashCooldownTotalMs = p.dashCooldownTotal;
      ps.powerUp = p.powerUp;
      ps.powerUpMs = p.powerUp ? roundUp100(Math.max(0, p.powerUpUntil - s.time)) : 0;
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
