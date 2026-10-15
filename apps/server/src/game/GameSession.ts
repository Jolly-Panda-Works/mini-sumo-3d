import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  Phase,
  randomAppearance,
  sanitizeAppearance,
  type Appearance,
  type EliminationReason,
} from "@mini-sumo/shared";
import { applyArenaEliminations, ringPositions } from "../simulation/ArenaSystem.js";
import { resolveCollisions } from "../simulation/CollisionSystem.js";
import { canTransition, computeStandings, determineOutcome } from "../simulation/MatchSystem.js";
import { stepMovement, tryDash } from "../simulation/MovementSystem.js";
import { createBody, type SimBody } from "../simulation/SimBody.js";
import { DEFAULT_CONFIG, type SimulationConfig } from "../simulation/SimulationConfig.js";
import { sanitizeName, validateMoveInput } from "../validation/InputValidator.js";
import { decideBot } from "./BotBrain.js";
import { createRng, pickBotName, randomId } from "./botNames.js";

export interface SessionPlayer extends SimBody {
  name: string;
  colorIndex: number;
  joinOrder: number;
  connected: boolean;
  placement: number;
  elimReason: EliminationReason | "";
  /** Token bucket for rate limiting client messages. */
  tokens: number;
  tokensUpdatedAt: number;
  /** Computer-controlled wrestler (driven by BotBrain through the normal input path). */
  isBot: boolean;
  /** Simulation time of the bot's next decision. */
  nextThinkAt: number;
  /** Hair, face and outfit. The belt colour always comes from colorIndex. */
  appearance: Appearance;
}

export interface SessionOptions {
  /**
   * Quick match room: a lone player waits up to cfg.quickMatchWaitMs for others, then the
   * room is filled with bots and the match starts automatically.
   */
  quickMatch?: boolean;
  /** Seed for bot names/ids/behaviour (deterministic tests). */
  seed?: number;
  /**
   * Paid arena room: humans only, single round, automatic start. The bout starts
   * startDelayMs after a second player joins (at once when full); a lone player is
   * cancelled after cancelAfterMs.
   */
  paidArena?: { startDelayMs: number; cancelAfterMs: number };
}

export type SessionEvent =
  | { type: "phase"; from: Phase; to: Phase }
  | { type: "impact"; a: string; b: string; x: number; y: number; strength: number }
  | { type: "eliminated"; id: string; name: string; reason: EliminationReason }
  | { type: "dash"; id: string }
  | { type: "roundOver"; winnerId: string | null; draw: boolean; durationMs: number }
  /** Paid arena: nobody else joined in time; the room should refund and close. */
  | { type: "cancelled" }
  /** Paid arena: results shown; the room should close (each bout needs a new entry). */
  | { type: "finished" };

export type ActionResult = { ok: true } | { ok: false; error: string };

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

/**
 * The complete authoritative game for one room, independent of Colyseus so it can be
 * unit-tested. Time is simulation time in ms, advanced only by fixed steps in update().
 *
 * Disconnect policy:
 * - waiting / lobby / countdown: the player is removed immediately.
 * - playing: the player is eliminated ("left") and kept until the round ends (for standings).
 * - roundOver: the player is marked disconnected and removed when the room returns to the lobby.
 * - The host role moves to the earliest-joined connected human.
 *
 * Bots: the host of a private room can add/remove bots in the lobby. In quick match rooms
 * bots fill the room after the wait time. Bots look like normal players and use the same
 * input and physics; in quick match they are removed again when the room returns to the lobby.
 */
export class GameSession {
  readonly players = new Map<string, SessionPlayer>();
  readonly cfg: SimulationConfig;
  readonly maxPlayers: number;
  readonly stepMs: number;

  phase: Phase = Phase.Waiting;
  /** Simulation clock (ms). */
  time = 0;
  phaseEndsAt = 0;
  hostId = "";
  winnerId = "";
  isDraw = false;
  round = 0;
  standings: string[] = [];

  readonly quickMatch: boolean;
  readonly paidArena: { startDelayMs: number; cancelAfterMs: number } | null;
  /** Paid arena: simulation time at which the bout starts / the room is cancelled (-1 = none). */
  private autoStartAt = -1;
  private cancelAt = -1;
  private cancelled = false;
  private playStartedAt = 0;
  /** Simulation time when the quick-match wait started, -1 when not searching. */
  private searchStartedAt = -1;
  private readonly rng: () => number;
  private accumulator = 0;
  private joinCounter = 0;
  private events: SessionEvent[] = [];

  constructor(cfg: SimulationConfig = DEFAULT_CONFIG, maxPlayers: number = MAX_PLAYERS, options: SessionOptions = {}) {
    this.cfg = cfg;
    this.paidArena = options.paidArena ?? null;
    this.quickMatch = options.quickMatch === true && !this.paidArena;
    this.rng = createRng(options.seed ?? Math.floor(Math.random() * 2 ** 32));
    this.maxPlayers = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(maxPlayers)));
    this.stepMs = 1000 / cfg.tickRate;
  }

  // ---------------------------------------------------------------- queries

  get connectedPlayers(): SessionPlayer[] {
    return [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder);
  }

  get humans(): SessionPlayer[] {
    return this.connectedPlayers.filter((p) => !p.isBot);
  }

  get bots(): SessionPlayer[] {
    return this.connectedPlayers.filter((p) => p.isBot);
  }

  /** Quick match: ms left before bots fill the room (0 when not searching). */
  get searchRemainingMs(): number {
    if (this.paidArena) {
      const at = this.autoStartAt >= 0 ? this.autoStartAt : this.cancelAt;
      return at >= 0 ? Math.max(0, at - this.time) : 0;
    }
    if (this.searchStartedAt < 0) return 0;
    return Math.max(0, this.searchStartedAt + this.cfg.quickMatchWaitMs - this.time);
  }

  get alivePlayers(): SessionPlayer[] {
    return [...this.players.values()].filter((p) => p.alive && p.connected);
  }

  get phaseRemainingMs(): number {
    if (this.phase === Phase.Countdown || this.phase === Phase.Playing || this.phase === Phase.RoundOver) {
      return Math.max(0, this.phaseEndsAt - this.time);
    }
    return 0;
  }

  canJoin(): ActionResult {
    if (this.phase !== Phase.Waiting && this.phase !== Phase.Lobby) {
      return fail("A match is in progress in this room. Try again when the round ends.");
    }
    if (this.connectedPlayers.length >= this.maxPlayers) return fail("This room is full.");
    return OK;
  }

  drainEvents(): SessionEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  // ---------------------------------------------------------------- membership

  addPlayer(id: string, rawName: unknown, rawAppearance?: unknown): ActionResult {
    if (this.players.has(id)) return fail("Already in this room.");
    const check = this.canJoin();
    if (!check.ok) return check;

    this.insertPlayer(id, (colorIndex) => sanitizeName(rawName, `Sumo ${colorIndex + 1}`), false, sanitizeAppearance(rawAppearance));
    if (!this.hostId) this.hostId = id;
    this.afterRosterChange();
    return OK;
  }

  /** Host of a private room adds a bot while in the lobby. */
  addBot(requesterId: string): ActionResult {
    if (this.paidArena) return fail("Bots can't join paid arenas.");
    if (this.quickMatch) return fail("Bots can only be added in private rooms.");
    if (requesterId !== this.hostId) return fail("Only the host can add bots.");
    const check = this.canJoin();
    if (!check.ok) return check;
    this.createBot();
    this.afterRosterChange();
    return OK;
  }

  /** Host of a private room removes a bot while in the lobby. */
  removeBot(requesterId: string, botId: unknown): ActionResult {
    if (this.quickMatch) return fail("Bots can only be managed in private rooms.");
    if (requesterId !== this.hostId) return fail("Only the host can remove bots.");
    if (this.phase !== Phase.Waiting && this.phase !== Phase.Lobby) return fail("Bots can only be removed in the lobby.");
    const bot = typeof botId === "string" ? this.players.get(botId) : undefined;
    if (!bot || !bot.isBot) return fail("That player is not a bot.");
    this.players.delete(bot.id);
    this.afterRosterChange();
    return OK;
  }

  /** Players customise their look before a match: only in waiting/lobby. */
  setAppearance(id: string, raw: unknown): ActionResult {
    const player = this.players.get(id);
    if (!player || !player.connected || player.isBot) return fail("Unknown player.");
    if (!this.consumeToken(player)) return fail("Too many requests.");
    if (this.phase !== Phase.Waiting && this.phase !== Phase.Lobby) return fail("You can change your look in the lobby.");
    player.appearance = sanitizeAppearance(raw);
    return OK;
  }

  private insertPlayer(id: string, name: (colorIndex: number) => string, isBot: boolean, appearance: Appearance): SessionPlayer {
    const used = new Set([...this.players.values()].map((p) => p.colorIndex));
    let colorIndex = 0;
    while (used.has(colorIndex) && colorIndex < PLAYER_COLORS.length - 1) colorIndex++;

    const player: SessionPlayer = {
      ...createBody(id),
      name: name(colorIndex),
      colorIndex,
      joinOrder: this.joinCounter++,
      connected: true,
      placement: 0,
      elimReason: "",
      tokens: this.cfg.inputBurst,
      tokensUpdatedAt: this.time,
      isBot,
      nextThinkAt: 0,
      appearance,
    };
    this.players.set(id, player);
    return player;
  }

  private createBot(): SessionPlayer {
    let id = randomId(this.rng);
    while (this.players.has(id)) id = randomId(this.rng);
    const names = [...this.players.values()].map((p) => p.name);
    return this.insertPlayer(id, () => pickBotName(names, this.rng), true, randomAppearance(this.rng));
  }

  private afterRosterChange(): void {
    this.refreshLobbyPhase();
    this.layoutLobby();
    this.updateSearch();
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (!player) return;

    switch (this.phase) {
      case Phase.Playing:
        player.connected = false;
        this.eliminate(player, "left");
        break;
      case Phase.RoundOver:
        player.connected = false;
        break;
      default:
        this.players.delete(id);
    }

    if (this.hostId === id) this.hostId = this.firstHumanId();

    if (this.phase === Phase.Countdown) {
      if (this.connectedPlayers.length < MIN_PLAYERS) this.goToLobby();
    } else if (this.phase === Phase.Playing) {
      this.checkLastStanding();
    } else if (this.phase === Phase.Waiting || this.phase === Phase.Lobby) {
      this.afterRosterChange();
    }
  }

  // ---------------------------------------------------------------- client actions

  handleInput(id: string, raw: unknown): boolean {
    const player = this.players.get(id);
    if (!player || !player.connected || !this.consumeToken(player)) return false;
    const input = validateMoveInput(raw);
    if (!input) return false;
    if (!player.alive) return false;
    player.inputX = input.x;
    player.inputY = input.y;
    return true;
  }

  handleDash(id: string): ActionResult {
    const player = this.players.get(id);
    if (!player || !player.connected) return fail("Unknown player.");
    if (!this.consumeToken(player)) return fail("Too many requests.");
    if (this.phase !== Phase.Playing) return fail("Dash is only available during a bout.");
    if (!player.alive) return fail("You are out of this round.");
    if (!tryDash(player, this.time, this.cfg)) return fail("Dash is cooling down.");
    this.events.push({ type: "dash", id });
    return OK;
  }

  requestStart(id: string): ActionResult {
    if (this.paidArena) return fail("Paid bouts start automatically.");
    if (id !== this.hostId) return fail("Only the host can start the match.");
    if (this.phase === Phase.Waiting) return fail(`You need at least ${MIN_PLAYERS} players to start.`);
    if (this.phase !== Phase.Lobby) return fail("The match has already started.");
    if (this.connectedPlayers.length < MIN_PLAYERS) return fail(`You need at least ${MIN_PLAYERS} players to start.`);
    return this.startCountdown() ? OK : fail("The match could not be started.");
  }

  requestRematch(id: string): ActionResult {
    if (this.paidArena) return fail("Each paid bout needs a new entry. Pick the arena again.");
    if (id !== this.hostId) return fail("Only the host can start a rematch.");
    if (this.phase !== Phase.RoundOver) return fail("A rematch is only possible after a round ends.");
    this.purgeDisconnected();
    if (this.connectedPlayers.length < MIN_PLAYERS) {
      this.goToLobby();
      return fail(`You need at least ${MIN_PLAYERS} players for a rematch.`);
    }
    return this.startCountdown() ? OK : fail("The rematch could not be started.");
  }

  requestReturnToLobby(id: string): ActionResult {
    if (this.paidArena) return fail("Each paid bout needs a new entry. Pick the arena again.");
    if (id !== this.hostId) return fail("Only the host can return the room to the lobby.");
    if (this.phase !== Phase.RoundOver) return fail("The room is not showing results.");
    this.goToLobby();
    return OK;
  }

  // ---------------------------------------------------------------- simulation

  /** Advance by real elapsed time; runs as many fixed steps as fit (bounded). */
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.accumulator += Math.min(deltaMs, this.cfg.maxFrameDeltaMs);
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.cfg.maxStepsPerUpdate) {
      this.step();
      this.accumulator -= this.stepMs;
      steps++;
    }
    // Drop backlog we could not process instead of spiralling.
    if (steps === this.cfg.maxStepsPerUpdate && this.accumulator >= this.stepMs) this.accumulator = 0;
  }

  private step(): void {
    this.time += this.stepMs;
    switch (this.phase) {
      case Phase.Countdown:
        if (this.time >= this.phaseEndsAt) this.beginPlaying();
        break;
      case Phase.Playing:
        this.simulate(this.stepMs / 1000);
        break;
      case Phase.RoundOver:
        if (this.time >= this.phaseEndsAt) {
          if (this.paidArena) {
            if (this.phaseEndsAt >= 0) this.events.push({ type: "finished" });
            this.phaseEndsAt = Number.POSITIVE_INFINITY;
          } else {
            this.goToLobby();
          }
        }
        break;
      default:
        if (this.paidArena) this.tickPaidArena();
        else this.tickSearch();
        break;
    }
  }

  /**
   * Order within a tick (documented tiebreak behaviour):
   * movement -> collisions -> ring-outs -> last-standing check -> timer check.
   * So an elimination on the final tick counts before the timeout tiebreaker.
   */
  private simulate(dt: number): void {
    const bodies = this.alivePlayers.sort((a, b) => a.joinOrder - b.joinOrder);
    this.driveBots(bodies);
    for (const body of bodies) stepMovement(body, dt, this.cfg, this.time);

    for (const impact of resolveCollisions(bodies, this.cfg, this.time)) {
      this.events.push({ type: "impact", ...impact });
    }

    for (const id of applyArenaEliminations(bodies, this.cfg, this.time)) {
      const player = this.players.get(id)!;
      player.elimReason = "ringOut";
      this.events.push({ type: "eliminated", id, name: player.name, reason: "ringOut" });
    }

    if (this.checkLastStanding()) return;
    if (this.time >= this.phaseEndsAt) this.endRound();
  }

  private checkLastStanding(): boolean {
    if (this.phase !== Phase.Playing) return false;
    if (this.alivePlayers.length <= 1) {
      this.endRound();
      return true;
    }
    return false;
  }

  private eliminate(player: SessionPlayer, reason: EliminationReason): void {
    if (!player.alive) return;
    player.alive = false;
    player.eliminatedAt = this.time;
    player.vx = 0;
    player.vy = 0;
    player.inputX = 0;
    player.inputY = 0;
    player.elimReason = reason;
    this.events.push({ type: "eliminated", id: player.id, name: player.name, reason });
  }

  // ---------------------------------------------------------------- phase transitions

  private transition(to: Phase): boolean {
    if (!canTransition(this.phase, to)) return false;
    const from = this.phase;
    this.phase = to;
    this.events.push({ type: "phase", from, to });
    return true;
  }

  private startCountdown(): boolean {
    if (!this.transition(Phase.Countdown)) return false;
    this.round++;
    this.winnerId = "";
    this.isDraw = false;
    this.standings = [];

    const players = this.connectedPlayers;
    const spots = ringPositions(players.length, this.cfg.arenaRadius * this.cfg.spawnRadiusFactor);
    players.forEach((player, i) => {
      const spot = spots[i]!;
      this.resetBody(player, spot.x, spot.y, spot.angle);
    });
    this.phaseEndsAt = this.time + this.cfg.countdownMs;
    return true;
  }

  private beginPlaying(): void {
    if (!this.transition(Phase.Playing)) return;
    this.playStartedAt = this.time;
    this.phaseEndsAt = this.time + this.cfg.matchDurationMs;
  }

  /** Finalizes the round. Guarded by the state machine, so it runs exactly once per round. */
  private endRound(): boolean {
    if (!this.transition(Phase.RoundOver)) return false;

    const outcome = determineOutcome(this.alivePlayers, this.cfg);
    this.winnerId = outcome.winnerId ?? "";
    this.isDraw = outcome.draw;

    const standings = computeStandings([...this.players.values()], outcome);
    for (const s of standings) this.players.get(s.id)!.placement = s.placement;
    this.standings = standings.map((s) => s.id);

    for (const player of this.players.values()) {
      player.vx = 0;
      player.vy = 0;
      player.inputX = 0;
      player.inputY = 0;
    }
    this.phaseEndsAt = this.time + this.cfg.resultsDurationMs;
    this.events.push({ type: "roundOver", winnerId: outcome.winnerId, draw: outcome.draw, durationMs: this.time - this.playStartedAt });
    return true;
  }

  /** Return to waiting/lobby from countdown or results. */
  private goToLobby(): void {
    this.purgeDisconnected();
    // Quick match: drop the fill-in bots so real players can join again.
    if (this.quickMatch) for (const bot of this.bots) this.players.delete(bot.id);
    const target = this.connectedPlayers.length >= MIN_PLAYERS ? Phase.Lobby : Phase.Waiting;
    if (!this.transition(target)) return;
    this.phaseEndsAt = 0;
    for (const player of this.players.values()) player.placement = 0;
    this.layoutLobby();
    this.updateSearch();
  }

  private refreshLobbyPhase(): void {
    if (this.phase !== Phase.Waiting && this.phase !== Phase.Lobby) return;
    const target = this.connectedPlayers.length >= MIN_PLAYERS ? Phase.Lobby : Phase.Waiting;
    if (target !== this.phase) this.transition(target);
  }

  private purgeDisconnected(): void {
    for (const [id, player] of this.players) if (!player.connected) this.players.delete(id);
    if (!this.players.has(this.hostId)) this.hostId = this.firstHumanId();
  }

  /** Lobby players stand in a loose circle so the 3D view has something to show. */
  private layoutLobby(): void {
    if (this.phase !== Phase.Waiting && this.phase !== Phase.Lobby) return;
    const players = this.connectedPlayers;
    const spots = ringPositions(Math.max(players.length, 2), this.cfg.arenaRadius * this.cfg.lobbyRadiusFactor);
    players.forEach((player, i) => {
      const spot = spots[i]!;
      this.resetBody(player, spot.x, spot.y, spot.angle);
    });
  }

  private resetBody(player: SessionPlayer, x: number, y: number, angle: number): void {
    player.x = x;
    player.y = y;
    player.vx = 0;
    player.vy = 0;
    player.angle = angle;
    player.inputX = 0;
    player.inputY = 0;
    player.alive = true;
    player.eliminatedAt = -1;
    player.dashEndsAt = 0;
    player.dashReadyAt = 0;
    player.placement = 0;
    player.elimReason = "";
  }

  private firstHumanId(): string {
    return this.humans[0]?.id ?? "";
  }

  // ---------------------------------------------------------------- quick match & bots

  /** Starts or stops the quick-match wait depending on who is in the room. */
  /** Paid arena timers: auto start with 2+ players, cancel when alone too long. */
  private updatePaidArena(): void {
    const lobby = this.phase === Phase.Waiting || this.phase === Phase.Lobby;
    const humans = this.humans.length;
    if (!this.paidArena || !lobby || this.cancelled) {
      this.autoStartAt = -1;
      this.cancelAt = -1;
      return;
    }
    if (humans >= 2) {
      this.cancelAt = -1;
      if (humans >= this.maxPlayers) this.autoStartAt = this.time;
      else if (this.autoStartAt < 0) this.autoStartAt = this.time + this.paidArena.startDelayMs;
    } else {
      this.autoStartAt = -1;
      if (humans === 1 && this.cancelAt < 0) this.cancelAt = this.time + this.paidArena.cancelAfterMs;
      if (humans === 0) this.cancelAt = -1;
    }
  }

  private tickPaidArena(): void {
    if (this.autoStartAt >= 0 && this.time >= this.autoStartAt) {
      this.autoStartAt = -1;
      this.refreshLobbyPhase();
      this.startCountdown();
    } else if (this.cancelAt >= 0 && this.time >= this.cancelAt) {
      this.cancelAt = -1;
      this.cancelled = true;
      this.events.push({ type: "cancelled" });
    }
  }

  private updateSearch(): void {
    if (this.paidArena) {
      this.updatePaidArena();
      return;
    }
    const lobby = this.phase === Phase.Waiting || this.phase === Phase.Lobby;
    const lonely = this.humans.length === 1 && this.bots.length === 0;
    if (!this.quickMatch || !lobby || !lonely) {
      this.searchStartedAt = -1;
    } else if (this.searchStartedAt < 0) {
      this.searchStartedAt = this.time;
    }
  }

  /** Nobody joined in time: fill the room with bots and start. */
  private tickSearch(): void {
    if (this.searchStartedAt < 0 || this.time - this.searchStartedAt < this.cfg.quickMatchWaitMs) return;
    this.searchStartedAt = -1;
    while (this.connectedPlayers.length < this.maxPlayers) this.createBot();
    this.refreshLobbyPhase();
    this.startCountdown();
  }

  private driveBots(alive: readonly SessionPlayer[]): void {
    for (const bot of alive) {
      if (!bot.isBot || this.time < bot.nextThinkAt) continue;
      const decision = decideBot(bot, alive, this.cfg, this.rng);
      bot.inputX = decision.x;
      bot.inputY = decision.y;
      if (decision.dash && tryDash(bot, this.time, this.cfg)) this.events.push({ type: "dash", id: bot.id });
      bot.nextThinkAt = this.time + this.cfg.botThinkMinMs + this.rng() * (this.cfg.botThinkMaxMs - this.cfg.botThinkMinMs);
    }
  }

  private consumeToken(player: SessionPlayer): boolean {
    const elapsed = this.time - player.tokensUpdatedAt;
    if (elapsed > 0) {
      player.tokens = Math.min(this.cfg.inputBurst, player.tokens + (elapsed / 1000) * this.cfg.inputRateLimitPerSec);
      player.tokensUpdatedAt = this.time;
    }
    if (player.tokens < 1) return false;
    player.tokens -= 1;
    return true;
  }
}
