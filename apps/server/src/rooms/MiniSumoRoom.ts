import { Room, ServerError, type Client } from "colyseus";
import {
  ClientMessage,
  Phase,
  ServerMessage,
  sanitizeBotLevel,
  type EconomyResultMessage,
  type ErrorPayload,
  type JoinOptions,
} from "@mini-sumo/shared";
import { ECONOMY, PRIVATE_ARENA_ID, getArena, type ArenaConfig } from "../economy/config.js";
import { EconomyError } from "../economy/Economy.js";
import { getEconomy } from "../economy/instance.js";
import { GameSession, type ActionResult } from "../game/GameSession.js";
import { isDashing } from "../simulation/MovementSystem.js";
import { DEFAULT_CONFIG } from "../simulation/SimulationConfig.js";
import { sanitizeIsPrivate, sanitizeMaxPlayers } from "../validation/InputValidator.js";
import { MiniSumoState, PlayerState } from "../state/MiniSumoState.js";

const roundUp100 = (ms: number) => Math.ceil(ms / 100) * 100;

/**
 * Thin Colyseus adapter around GameSession:
 * client messages -> session actions, session -> schema state, session events -> broadcasts.
 *
 * Arenas (see economy/config.ts):
 * - "training": public quick match, free, bots fill in, small free rewards.
 * - paid arenas: humans only, entry fee charged on join, refunded if the bout never starts
 *   for that player, winner paid by the server once per match, room closes after results.
 * - "private": invite-only, free, no rewards.
 */
export class MiniSumoRoom extends Room<MiniSumoState> {
  private session!: GameSession;
  private standingsKey = "";
  /**
   * Our own record of the matchmaking lock. Must not be called `locked`: Colyseus' Room
   * already has a read-only `locked` getter, and assigning to it throws while the room is
   * being created (which made every quick match fail).
   */
  private matchmakingLocked = false;
  private arena: ArenaConfig | null = null;
  private arenaId = "training";
  /** sessionId -> accountId, kept after a player leaves (needed for settlement). */
  private readonly accounts = new Map<string, string>();

  private get paid(): boolean {
    return (this.arena?.entryFee ?? 0) > 0;
  }

  private matchId(): string {
    return `${this.roomId}:${this.session.round}`;
  }

  override onCreate(options: JoinOptions = {}): void {
    const isPrivate = sanitizeIsPrivate(options.private);
    const arena = isPrivate ? null : getArena(options.arenaId ?? "training");
    if (!isPrivate && (!arena || !arena.enabled)) throw new ServerError(4004, "That arena is not available.");
    if (arena && arena.entryFee > 0 && !getEconomy()) throw new ServerError(4004, "Paid arenas are not available.");
    this.arena = arena;
    this.arenaId = isPrivate ? PRIVATE_ARENA_ID : arena!.id;
    const maxPlayers = arena ? arena.maxPlayers : sanitizeMaxPlayers(options.maxPlayers);

    this.state = new MiniSumoState();
    this.maxClients = maxPlayers;
    // Training: quick match with bot fill. Paid: humans only, automatic start. Private: host starts.
    this.session = new GameSession(DEFAULT_CONFIG, maxPlayers, {
      quickMatch: !isPrivate && !this.paid,
      botLevel: sanitizeBotLevel(options.botLevel),
      paidArena: this.paid ? { startDelayMs: ECONOMY.paidStartDelayMs, cancelAfterMs: ECONOMY.paidCancelAfterMs } : undefined,
    });
    this.state.maxPlayers = maxPlayers;
    this.state.isPrivate = isPrivate;
    this.state.arenaId = this.arenaId;
    this.state.botLevel = this.paid ? "" : this.session.botLevel;
    // Private rooms are excluded from joinOrCreate, but still joinable by id.
    if (isPrivate) void this.setPrivate(true);

    this.setPatchRate(1000 / DEFAULT_CONFIG.tickRate);

    this.onMessage(ClientMessage.Input, (client, message: unknown) => {
      this.session.handleInput(client.sessionId, message);
    });
    this.onMessage(ClientMessage.Dash, (client) => {
      // Rejected dashes (cooldown, wrong phase) are silently ignored; the HUD shows cooldown.
      this.session.handleDash(client.sessionId);
      this.flushEvents();
    });
    this.onMessage(ClientMessage.StartMatch, (client) => {
      this.reply(client, this.session.requestStart(client.sessionId));
    });
    this.onMessage(ClientMessage.Rematch, (client) => {
      this.reply(client, this.session.requestRematch(client.sessionId));
    });
    this.onMessage(ClientMessage.ReturnToLobby, (client) => {
      this.reply(client, this.session.requestReturnToLobby(client.sessionId));
    });
    this.onMessage(ClientMessage.SetAppearance, (client, message: unknown) => {
      // Only owned cosmetics: the server replaces anything not owned with the default.
      const economy = getEconomy();
      const accountId = this.accounts.get(client.sessionId);
      const look = economy && accountId ? economy.saveAppearance(accountId, message) : message;
      this.reply(client, this.session.setAppearance(client.sessionId, look));
    });
    this.onMessage(ClientMessage.AddBot, (client) => {
      this.reply(client, this.session.addBot(client.sessionId));
    });
    this.onMessage(ClientMessage.RemoveBot, (client, message: unknown) => {
      const id = typeof message === "object" && message !== null ? (message as Record<string, unknown>).id : undefined;
      this.reply(client, this.session.removeBot(client.sessionId, id));
    });

    this.setSimulationInterval((deltaTime) => {
      this.session.update(deltaTime);
      this.flushEvents();
      this.syncState();
    }, 1000 / DEFAULT_CONFIG.tickRate);

    this.syncState();
  }

  /** Resolves the guest account from its token. The client never sends its account id. */
  override onAuth(_client: Client, options: JoinOptions = {}): { accountId: string | null } {
    const economy = getEconomy();
    if (!economy) return { accountId: null };
    const accountId = economy.authenticate(options.authToken);
    if (!accountId) throw new ServerError(4010, "Your player account couldn't be verified. Restart the game and try again.");
    return { accountId };
  }

  override onJoin(client: Client, options: JoinOptions = {}, auth?: { accountId: string | null }): void {
    const economy = getEconomy();
    const accountId = auth?.accountId ?? null;
    if (accountId && [...this.accounts.entries()].some(([id, acc]) => acc === accountId && this.session.players.get(id)?.connected)) {
      throw new ServerError(4005, "You are already in this room on another screen.");
    }
    const check = this.session.canJoin();
    if (!check.ok) throw new ServerError(4003, check.error);

    const appearance = economy && accountId ? economy.saveAppearance(accountId, options.appearance) : options.appearance;
    if (this.paid) {
      if (!economy || !accountId) throw new ServerError(4010, "Paid arenas need a player account.");
      try {
        economy.reserveEntry(accountId, this.arenaId, this.roomId);
      } catch (error) {
        throw new ServerError(4020, error instanceof EconomyError ? error.message : "Couldn't pay the entry fee.");
      }
    }

    const result = this.session.addPlayer(client.sessionId, options.name, appearance);
    if (!result.ok) {
      if (this.paid && economy && accountId) economy.refundReserved(this.roomId, accountId, "Couldn't join the room: entry refunded");
      throw new ServerError(4003, result.error);
    }
    if (accountId) this.accounts.set(client.sessionId, accountId);
    this.flushEvents();
    this.syncState();
  }

  override onLeave(client: Client): void {
    // Reconnection is not supported in this MVP: any leave (consented or not) is final.
    this.session.removePlayer(client.sessionId);
    // Paid arenas: leaving before the bout starts refunds the entry; after that it is spent.
    const economy = getEconomy();
    const accountId = this.accounts.get(client.sessionId);
    if (this.paid && economy && accountId) economy.refundReserved(this.roomId, accountId);
    this.flushEvents();
    this.syncState();
  }

  override onDispose(): void {
    // Any entry not settled by now belongs to a bout that never finished: refund it.
    const economy = getEconomy();
    if (this.paid && economy) economy.refundRoom(this.roomId, "Match closed before it finished: entry refunded");
  }

  private reply(client: Client, result: ActionResult): void {
    if (!result.ok) {
      const payload: ErrorPayload = { message: result.error };
      client.send(ServerMessage.Error, payload);
    }
    this.flushEvents();
    this.syncState();
  }

  private flushEvents(): void {
    for (const event of this.session.drainEvents()) {
      switch (event.type) {
        case "impact":
          this.broadcast(ServerMessage.Impact, {
            a: event.a,
            b: event.b,
            x: event.x,
            y: event.y,
            strength: Math.round(event.strength * 10) / 10,
          });
          break;
        case "eliminated":
          this.broadcast(ServerMessage.Eliminated, { sessionId: event.id, name: event.name, reason: event.reason, by: event.by });
          break;
        case "dash":
          this.broadcast(ServerMessage.Dash, { sessionId: event.id });
          break;
        case "phase":
          if (event.to === Phase.Playing) this.onBoutStarted();
          break;
        case "roundOver":
          this.onRoundOver(event.winnerId, event.durationMs);
          break;
        case "cancelled":
          this.onCancelled();
          break;
        case "finished":
          // Each paid bout needs a new entry: send everyone back to the arena list.
          void this.disconnect();
          break;
      }
    }
  }

  /**
   * Lock the room for matchmaking while a match runs or while bots fill it, so new players
   * are routed elsewhere; unlock in the lobby when there is space again.
   */
  private updateLock(): void {
    const s = this.session;
    const inLobby = s.phase === Phase.Lobby || s.phase === Phase.Waiting;
    const shouldLock = !inLobby || s.connectedPlayers.length >= s.maxPlayers;
    if (shouldLock === this.matchmakingLocked) return;
    this.matchmakingLocked = shouldLock;
    if (shouldLock) void this.lock();
    else if (this.clients.length < this.maxClients) void this.unlock();
    else this.matchmakingLocked = true;
  }

  // ---------------------------------------------------------------- economy hooks

  private onBoutStarted(): void {
    const economy = getEconomy();
    if (!this.paid || !economy) return;
    const accountIds = this.session.connectedPlayers.map((p) => this.accounts.get(p.id)).filter((a): a is string => Boolean(a));
    economy.lockEntries(this.roomId, this.matchId(), accountIds);
  }

  private onRoundOver(winnerId: string | null, durationMs: number): void {
    const economy = getEconomy();
    if (!economy || this.arenaId === PRIVATE_ARENA_ID) return;
    const matchId = this.matchId();
    const winnerAccountId = winnerId ? (this.accounts.get(winnerId) ?? null) : null;

    const settlement = this.paid ? economy.settleMatch({ matchId, roomId: this.roomId, arenaId: this.arenaId, winnerAccountId }) : null;
    const participants = [...this.session.players.values()]
      .filter((p) => !p.isBot && this.accounts.has(p.id))
      .map((p) => ({ accountId: this.accounts.get(p.id)!, won: p.id === winnerId, completed: p.connected && p.elimReason !== "left" }));
    const rewards = economy.recordMatch({ matchId, durationMs, rewarded: !this.paid, participants, arenaId: this.arenaId });

    for (const client of this.clients) {
      const accountId = this.accounts.get(client.sessionId);
      if (!accountId) continue;
      const fee = this.paid ? (this.arena?.entryFee ?? 0) : 0;
      const won = settlement?.outcome === "won" && settlement.winnerAccountId === accountId;
      const refunded = settlement ? settlement.outcome === "draw" || settlement.outcome === "void" : false;
      const message: EconomyResultMessage = {
        kind: this.paid ? (refunded ? "refunded" : "settled") : "rewarded",
        arenaId: this.arenaId,
        entryFee: fee,
        prize: won ? settlement!.prize : 0,
        economyFee: settlement?.outcome === "won" ? settlement.sink : 0,
        rewards: rewards.get(accountId) ?? 0,
        balance: economy.balance(accountId),
        note: refunded
          ? "No single winner: your entry fee was refunded."
          : won
            ? "You won the pool."
            : this.paid
              ? "Entry fee spent. Better luck next bout!"
              : "",
      };
      client.send(ServerMessage.Economy, message);
    }
  }

  private onCancelled(): void {
    const economy = getEconomy();
    if (economy) economy.refundRoom(this.roomId, "Not enough players joined: entry refunded");
    for (const client of this.clients) {
      const accountId = this.accounts.get(client.sessionId);
      const message: EconomyResultMessage = {
        kind: "cancelled",
        arenaId: this.arenaId,
        entryFee: this.arena?.entryFee ?? 0,
        prize: 0,
        economyFee: 0,
        rewards: 0,
        balance: economy && accountId ? economy.balance(accountId) : null,
        note: "Nobody else joined in time. Your entry fee was refunded.",
      };
      client.send(ServerMessage.Economy, message);
    }
    this.clock.setTimeout(() => void this.disconnect(), 1500);
  }

  private syncState(): void {
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

    for (const id of [...state.players.keys()]) {
      if (!s.players.has(id)) state.players.delete(id);
    }
    for (const [id, p] of s.players) {
      let ps = state.players.get(id);
      if (!ps) {
        ps = new PlayerState();
        ps.sessionId = id;
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
      ps.dashCooldownMs = Math.min(65_000, roundUp100(Math.max(0, p.dashReadyAt - s.time)));
      ps.dashCooldownTotalMs = Math.min(65_000, p.dashCooldownTotal);
      ps.placement = p.placement;
      ps.elimReason = p.elimReason;
      // Quick-match bots are indistinguishable from players on the wire.
      ps.isBot = p.isBot && !s.quickMatch;
      ps.hair = p.appearance.hair;
      ps.hairColor = p.appearance.hairColor;
      ps.face = p.appearance.face;
      ps.outfit = p.appearance.outfit;
    }

    this.updateLock();

    const key = s.standings.join(",");
    if (key !== this.standingsKey) {
      this.standingsKey = key;
      state.standings.clear();
      for (const id of s.standings) state.standings.push(id);
    }
  }
}
