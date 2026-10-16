import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  Phase,
  randomAppearance,
  sanitizeBotLevel,
  POWER_UP_KINDS,
  type BotLevel,
  type PowerUpKind,
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
import { decideBot, easedTuning, type BotTuning } from "./BotBrain.js";

/** Bots go for a power-up flag only once it's their turn (players get the first chance). */
export function botSeeksItem(cfg: SimulationConfig, level: BotLevel, sinceSpawnMs: number): boolean {
  return sinceSpawnMs >= cfg.botItemDelayMs[level];
}

/** Levels shown for bots of each difficulty. */
const BOT_LEVEL_RANGE: Record<BotLevel, [number, number]> = { easy: [1, 4], normal: [3, 8], hard: [7, 14] };

/** The bot that gives up in a bots-only finish: slow, wobbly, never dashes, ignores the edge. */
const WEAK_BOT: BotTuning = { thinkMinMs: 350, thinkMaxMs: 600, noise: 1.6, dashChance: 0, inputScale: 0.3, edgeStart: 0.97 };
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
  /** Length of the cooldown started by the last dash (ms). */
  dashCooldownTotal: number;
  /** Last wrestler in contact and when (for ring-out credit). */
  lastTouchBy: string;
  lastTouchAt: number;
  /** Countdown entrance: from the ring side to the start mark. */
  entrance: { fromX: number; fromY: number; toX: number; toY: number; angle: number } | null;
  /** Active power-up and when it ends. */
  powerUp: PowerUpKind | "";
  powerUpUntil: number;
  /** Player level shown in the HUD (bots get one that fits their difficulty). */
  level: number;
}

/** The power-up flag standing on the ring, if any. */
export interface PowerUpItem {
  kind: PowerUpKind;
  x: number;
  y: number;
  spawnedAt: number;
  expiresAt: number;
}

export interface SessionOptions {
  /**
   * Quick match room: a lone player waits up to cfg.quickMatchWaitMs for others, then the
   * room is filled with bots and the match starts automatically.
   */
  quickMatch?: boolean;
  /** Seed for bot names/ids/behaviour (deterministic tests). */
  seed?: number;
  /** Bot difficulty (default "normal"). */
  botLevel?: BotLevel;
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
  | { type: "eliminated"; id: string; name: string; reason: EliminationReason; by: string | null }
  | { type: "dash"; id: string }
  | { type: "item"; kind: PowerUpKind; x: number; y: number; state: "spawned" | "expired" | "taken"; by?: string }
  | { type: "powerUp"; id: string; kind: PowerUpKind; active: boolean }
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
 * bots fill the room after the wait time and the host starts the match. Bots look like normal players and use the same
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
  readonly botLevel: BotLevel;
  readonly paidArena: { startDelayMs: number; cancelAfterMs: number } | null;
  /** Paid arena: simulation time at which the bout starts / the room is cancelled (-1 = none). */
  private autoStartAt = -1;
  private cancelAt = -1;
  private cancelled = false;
  private playStartedAt = 0;
  /** Simulation time when the quick-match wait started, -1 when not searching. */
  private searchStartedAt = -1;
  private nextBotAt = 0;
  /** Power-up flag on the ring and when the next one appears. */
  item: PowerUpItem | null = null;
  private nextItemAt = Number.POSITIVE_INFINITY;
  private countdownStartedAt = 0;
  private readonly rng: () => number;
  private accumulator = 0;
  private joinCounter = 0;
  private events: SessionEvent[] = [];

  constructor(cfg: SimulationConfig = DEFAULT_CONFIG, maxPlayers: number = MAX_PLAYERS, options: SessionOptions = {}) {
    this.cfg = cfg;
    this.paidArena = options.paidArena ?? null;
    this.quickMatch = options.quickMatch === true && !this.paidArena;
    this.botLevel = sanitizeBotLevel(options.botLevel);
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
  /** True while bots are joining one by one at the end of the wait. */
  get filling(): boolean {
    return this.searchStartedAt >= 0 && this.time - this.searchStartedAt >= this.cfg.quickMatchWaitMs;
  }

  get searchRemainingMs(): number {
    if (this.paidArena) {
      const at = this.autoStartAt >= 0 ? this.autoStartAt : this.cancelAt;
      return at >= 0 ? Math.max(0, at - this.time) : 0;
    }
    if (this.searchStartedAt < 0) return 0;
    // While bots are still joining, keep reporting a moment left so the Start button waits.
    return Math.max(this.filling ? 1 : 0, this.searchStartedAt + this.cfg.quickMatchWaitMs - this.time);
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

  addPlayer(id: string, rawName: unknown, rawAppearance?: unknown, rawLevel?: unknown): ActionResult {
    if (this.players.has(id)) return fail("Already in this room.");
    const check = this.canJoin();
    if (!check.ok) return check;

    const player = this.insertPlayer(id, (colorIndex) => sanitizeName(rawName, `Sumo ${colorIndex + 1}`), false, sanitizeAppearance(rawAppearance));
    player.level = typeof rawLevel === "number" && Number.isFinite(rawLevel) ? Math.max(1, Math.min(999, Math.floor(rawLevel))) : 1;
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
      dashCooldownTotal: this.cfg.dashCooldownMs,
      lastTouchBy: "",
      lastTouchAt: -1e9,
      entrance: null,
      powerUp: "",
      powerUpUntil: 0,
      level: 1,
    };
    this.players.set(id, player);
    return player;
  }

  private createBot(): SessionPlayer {
    let id = randomId(this.rng);
    while (this.players.has(id)) id = randomId(this.rng);
    const names = [...this.players.values()].map((p) => p.name);
    const bot = this.insertPlayer(id, () => pickBotName(names, this.rng), true, randomAppearance(this.rng));
    const [low, high] = BOT_LEVEL_RANGE[this.botLevel];
    bot.level = low + Math.floor(this.rng() * (high - low + 1));
    return bot;
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
    const cooldown = player.powerUp === "thunder" ? Math.min(this.cfg.thunderDashCooldownMs, this.humanDashCooldownMs()) : this.humanDashCooldownMs();
    if (!tryDash(player, this.time, this.cfg, cooldown)) return fail("Dash is cooling down.");
    player.dashCooldownTotal = cooldown;
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
        this.walkIn();
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
    this.tickPowerUps(bodies);
    this.driveBots(bodies);
    for (const body of bodies) stepMovement(body, dt, this.cfg, this.time);

    for (const impact of resolveCollisions(bodies, this.cfg, this.time)) {
      this.events.push({ type: "impact", ...impact });
    }

    this.recordContacts(bodies);
    this.collectItem(bodies);
    for (const id of applyArenaEliminations(bodies, this.cfg, this.time)) {
      const player = this.players.get(id)!;
      player.elimReason = "ringOut";
      const credited = player.lastTouchBy && this.time - player.lastTouchAt <= this.cfg.ringOutCreditMs ? player.lastTouchBy : null;
      this.events.push({ type: "eliminated", id, name: player.name, reason: "ringOut", by: credited });
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
    this.clearPowerUp(player, true);
    player.alive = false;
    player.eliminatedAt = this.time;
    player.vx = 0;
    player.vy = 0;
    player.inputX = 0;
    player.inputY = 0;
    player.elimReason = reason;
    this.events.push({ type: "eliminated", id: player.id, name: player.name, reason, by: null });
  }

  /** Remembers who touched whom, so a ring-out can be credited to the pusher. */
  private recordContacts(bodies: readonly SessionPlayer[]): void {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const reach = (this.cfg.playerRadius * ((a.radiusScale ?? 1) + (b.radiusScale ?? 1)) + 0.08) ** 2;
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > reach) continue;
        a.lastTouchBy = b.id;
        a.lastTouchAt = this.time;
        b.lastTouchBy = a.id;
        b.lastTouchAt = this.time;
      }
    }
  }

  /** Countdown, first part: everyone walks from the ring side to their start mark. */
  private walkIn(): void {
    const t = this.cfg.entranceMs > 0 ? Math.min(1, (this.time - this.countdownStartedAt) / this.cfg.entranceMs) : 1;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    for (const p of this.connectedPlayers) {
      const e = p.entrance;
      if (!e) continue;
      p.x = e.fromX + (e.toX - e.fromX) * eased;
      p.y = e.fromY + (e.toY - e.fromY) * eased;
      p.angle = t < 1 ? Math.atan2(e.toY - e.fromY, e.toX - e.fromX) : e.angle;
      if (t >= 1) p.entrance = null;
    }
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

    // Walk in from the ring-side slots, then the 3-2-1.
    const players = this.connectedPlayers;
    const ring = ringPositions(this.maxPlayers, this.cfg.arenaRadius * this.cfg.lobbyRadiusFactor);
    const spots = ringPositions(players.length, this.cfg.arenaRadius * this.cfg.spawnRadiusFactor);
    players.forEach((player, i) => {
      const from = ring[player.colorIndex % ring.length]!;
      const spot = spots[i]!;
      this.resetBody(player, from.x, from.y, from.angle);
      player.entrance = { fromX: from.x, fromY: from.y, toX: spot.x, toY: spot.y, angle: spot.angle };
    });
    this.countdownStartedAt = this.time;
    this.phaseEndsAt = this.time + this.cfg.entranceMs + this.cfg.countdownMs;
    return true;
  }

  private beginPlaying(): void {
    if (!this.transition(Phase.Playing)) return;
    this.item = null;
    this.nextItemAt = this.cfg.powerUpsEnabled ? this.time + this.cfg.powerUpFirstMs : Number.POSITIVE_INFINITY;
    for (const p of this.players.values()) this.clearPowerUp(p, false);
    for (const p of this.connectedPlayers) {
      if (p.entrance) {
        p.x = p.entrance.toX;
        p.y = p.entrance.toY;
        p.angle = p.entrance.angle;
        p.entrance = null;
      }
    }
    this.playStartedAt = this.time;
    this.phaseEndsAt = this.time + this.cfg.matchDurationMs;
  }

  /** Finalizes the round. Guarded by the state machine, so it runs exactly once per round. */
  private endRound(): boolean {
    if (!this.transition(Phase.RoundOver)) return false;
    this.item = null;
    this.nextItemAt = Number.POSITIVE_INFINITY;
    for (const p of this.players.values()) this.clearPowerUp(p, false);

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
  /** Lobby: everyone waits at the ring side, in a fixed slot per colour (nobody shuffles). */
  private layoutLobby(): void {
    if (this.phase !== Phase.Waiting && this.phase !== Phase.Lobby) return;
    const spots = ringPositions(this.maxPlayers, this.cfg.arenaRadius * this.cfg.lobbyRadiusFactor);
    for (const player of this.connectedPlayers) {
      const spot = spots[player.colorIndex % spots.length]!;
      this.resetBody(player, spot.x, spot.y, spot.angle);
    }
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
    player.lastTouchBy = "";
    player.lastTouchAt = -1e9;
    player.entrance = null;
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
    const lonely = this.humans.length === 1 && (this.bots.length === 0 || this.filling);
    if (!this.quickMatch || !lobby || !lonely) {
      this.searchStartedAt = -1;
    } else if (this.searchStartedAt < 0) {
      this.searchStartedAt = this.time;
    }
  }

  /**
   * Nobody joined in time: bots join one by one (each appears at its ring-side slot).
   * The search ends when the room is full; then the host starts the match.
   */
  private tickSearch(): void {
    if (this.searchStartedAt < 0 || this.time - this.searchStartedAt < this.cfg.quickMatchWaitMs) return;
    if (this.time < this.nextBotAt) return;
    if (this.connectedPlayers.length < this.maxPlayers) {
      this.createBot();
      this.nextBotAt = this.time + this.cfg.botJoinIntervalMs;
      this.refreshLobbyPhase();
      this.layoutLobby();
    }
    if (this.connectedPlayers.length >= this.maxPlayers) this.searchStartedAt = -1;
  }

  /**
   * 0 for most of the bout, rising to 1 over the final stretch (cfg.lateGameMs). Drives the
   * comeback balance: faster dash recharge for players, gentler bots.
   */
  get lateness(): number {
    if (this.phase !== Phase.Playing || this.cfg.lateGameMs <= 0) return 0;
    const remaining = Math.max(0, this.phaseEndsAt - this.time);
    return Math.max(0, Math.min(1, (this.cfg.lateGameMs - remaining) / this.cfg.lateGameMs));
  }

  /** Dash cooldown for human players right now (shorter near the end of the bout). */
  humanDashCooldownMs(): number {
    const factor = 1 - (1 - this.cfg.lateDashCooldownFactor) * this.lateness;
    return Math.round(this.cfg.dashCooldownMs * factor);
  }

  // ---------------------------------------------------------------- power-ups

  /** Spawns and expires flags, ends finished power-ups and applies the active effects. */
  private tickPowerUps(alive: readonly SessionPlayer[]): void {
    const cfg = this.cfg;
    if (this.item && this.time >= this.item.expiresAt) {
      const { kind, x, y } = this.item;
      this.item = null;
      this.events.push({ type: "item", kind, x, y, state: "expired" });
      this.scheduleNextItem();
    }
    const remaining = this.phaseEndsAt - this.time;
    if (!this.item && this.time >= this.nextItemAt) {
      // No new flags in the final stretch.
      if (remaining > cfg.lateGameMs) this.spawnItem(alive);
      else this.nextItemAt = Number.POSITIVE_INFINITY;
    }
    for (const p of this.players.values()) {
      if (p.powerUp && this.time >= p.powerUpUntil) this.clearPowerUp(p, true);
      p.massScale = p.powerUp === "iron" ? cfg.ironMassScale : p.powerUp === "giant" ? cfg.giantMassScale : 1;
      p.radiusScale = p.powerUp === "giant" ? cfg.giantScale : 1;
      p.speedScale = p.powerUp === "wind" ? cfg.windSpeedScale : 1;
    }
  }

  private scheduleNextItem(): void {
    const { powerUpEveryMinMs: min, powerUpEveryMaxMs: max } = this.cfg;
    this.nextItemAt = this.time + min + this.rng() * (max - min);
  }

  /** A random flag at a random spot inside the ring, away from the wrestlers. */
  private spawnItem(alive: readonly SessionPlayer[]): void {
    const cfg = this.cfg;
    const kind = POWER_UP_KINDS[Math.floor(this.rng() * POWER_UP_KINDS.length)]!;
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const r = cfg.arenaRadius * cfg.powerUpSpawnRadiusFactor * Math.sqrt(this.rng());
      const a = this.rng() * Math.PI * 2;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
      if (alive.every((p) => Math.hypot(p.x - x, p.y - y) > cfg.playerRadius * 3)) break;
    }
    this.item = { kind, x, y, spawnedAt: this.time, expiresAt: this.time + cfg.powerUpItemLifeMs };
    this.events.push({ type: "item", kind, x, y, state: "spawned" });
  }

  /** Whoever reaches the flag first takes it (ties: lowest join order). */
  private collectItem(alive: readonly SessionPlayer[]): void {
    const item = this.item;
    if (!item) return;
    for (const p of alive) {
      const reach = this.cfg.playerRadius * (p.radiusScale ?? 1) + this.cfg.powerUpPickupRange;
      if (Math.hypot(p.x - item.x, p.y - item.y) > reach) continue;
      this.item = null;
      this.events.push({ type: "item", kind: item.kind, x: item.x, y: item.y, state: "taken", by: p.id });
      if (p.powerUp) this.clearPowerUp(p, true);
      p.powerUp = item.kind;
      p.powerUpUntil = this.time + this.cfg.powerUpDurationMs;
      this.events.push({ type: "powerUp", id: p.id, kind: item.kind, active: true });
      this.scheduleNextItem();
      return;
    }
  }

  private clearPowerUp(p: SessionPlayer, announce: boolean): void {
    if (p.powerUp && announce) this.events.push({ type: "powerUp", id: p.id, kind: p.powerUp, active: false });
    p.powerUp = "";
    p.powerUpUntil = 0;
    p.massScale = 1;
    p.radiusScale = 1;
    p.speedScale = 1;
  }

  /**
   * When only two bots are left (every human is out), one of them gives up so the bout ends
   * quickly instead of running down the clock. The one further from the centre is picked.
   */
  private weakBotId = "";

  private driveBots(alive: readonly SessionPlayer[]): void {
    const tuning = easedTuning(this.botLevel, this.lateness * this.cfg.lateBotEase);
    if (alive.length === 2 && alive.every((p) => p.isBot)) {
      if (!alive.some((p) => p.id === this.weakBotId)) {
        const [a, b] = alive as [SessionPlayer, SessionPlayer];
        this.weakBotId = Math.hypot(a.x, a.y) >= Math.hypot(b.x, b.y) ? a.id : b.id;
      }
    } else {
      this.weakBotId = "";
    }
    for (const bot of alive) {
      if (!bot.isBot || this.time < bot.nextThinkAt) continue;
      const decision = decideBot(bot, alive, this.cfg, this.rng, bot.id === this.weakBotId ? WEAK_BOT : tuning);
      // Go for the power-up flag once it's this bot level's turn (players get the first chance).
      const item = this.item;
      if (item && bot.id !== this.weakBotId && botSeeksItem(this.cfg, this.botLevel, this.time - item.spawnedAt)) {
        const dx = item.x - bot.x;
        const dy = item.y - bot.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-3) {
          decision.x = (dx / len) * tuning.inputScale;
          decision.y = (dy / len) * tuning.inputScale;
          decision.dash = false;
        }
      }
      bot.inputX = decision.x;
      bot.inputY = decision.y;
      const botCooldown = bot.powerUp === "thunder" ? this.cfg.thunderDashCooldownMs : this.cfg.dashCooldownMs;
      if (decision.dash && tryDash(bot, this.time, this.cfg, botCooldown)) {
        bot.dashCooldownTotal = botCooldown;
        this.events.push({ type: "dash", id: bot.id });
      }
      bot.nextThinkAt = this.time + tuning.thinkMinMs + this.rng() * (tuning.thinkMaxMs - tuning.thinkMinMs);
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
