import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS, Phase, type EliminationReason } from "@mini-sumo/shared";
import { applyArenaEliminations, ringPositions } from "../simulation/ArenaSystem.js";
import { resolveCollisions } from "../simulation/CollisionSystem.js";
import { canTransition, computeStandings, determineOutcome } from "../simulation/MatchSystem.js";
import { stepMovement, tryDash } from "../simulation/MovementSystem.js";
import { createBody, type SimBody } from "../simulation/SimBody.js";
import { DEFAULT_CONFIG, type SimulationConfig } from "../simulation/SimulationConfig.js";
import { sanitizeName, validateMoveInput } from "../validation/InputValidator.js";

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
}

export type SessionEvent =
  | { type: "phase"; from: Phase; to: Phase }
  | { type: "impact"; a: string; b: string; x: number; y: number; strength: number }
  | { type: "eliminated"; id: string; name: string; reason: EliminationReason }
  | { type: "dash"; id: string }
  | { type: "roundOver"; winnerId: string | null; draw: boolean };

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
 * - The host role moves to the earliest-joined connected player.
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

  private accumulator = 0;
  private joinCounter = 0;
  private events: SessionEvent[] = [];

  constructor(cfg: SimulationConfig = DEFAULT_CONFIG, maxPlayers: number = MAX_PLAYERS) {
    this.cfg = cfg;
    this.maxPlayers = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(maxPlayers)));
    this.stepMs = 1000 / cfg.tickRate;
  }

  // ---------------------------------------------------------------- queries

  get connectedPlayers(): SessionPlayer[] {
    return [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder);
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

  addPlayer(id: string, rawName: unknown): ActionResult {
    if (this.players.has(id)) return fail("Already in this room.");
    const check = this.canJoin();
    if (!check.ok) return check;

    const used = new Set([...this.players.values()].map((p) => p.colorIndex));
    let colorIndex = 0;
    while (used.has(colorIndex) && colorIndex < PLAYER_COLORS.length - 1) colorIndex++;

    const player: SessionPlayer = {
      ...createBody(id),
      name: sanitizeName(rawName, `Sumo ${colorIndex + 1}`),
      colorIndex,
      joinOrder: this.joinCounter++,
      connected: true,
      placement: 0,
      elimReason: "",
      tokens: this.cfg.inputBurst,
      tokensUpdatedAt: this.time,
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    this.refreshLobbyPhase();
    this.layoutLobby();
    return OK;
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

    if (this.hostId === id) this.hostId = this.connectedPlayers[0]?.id ?? "";

    if (this.phase === Phase.Countdown) {
      if (this.connectedPlayers.length < MIN_PLAYERS) this.goToLobby();
    } else if (this.phase === Phase.Playing) {
      this.checkLastStanding();
    } else if (this.phase === Phase.Waiting || this.phase === Phase.Lobby) {
      this.refreshLobbyPhase();
      this.layoutLobby();
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
    if (id !== this.hostId) return fail("Only the host can start the match.");
    if (this.phase === Phase.Waiting) return fail(`You need at least ${MIN_PLAYERS} players to start.`);
    if (this.phase !== Phase.Lobby) return fail("The match has already started.");
    if (this.connectedPlayers.length < MIN_PLAYERS) return fail(`You need at least ${MIN_PLAYERS} players to start.`);
    return this.startCountdown() ? OK : fail("The match could not be started.");
  }

  requestRematch(id: string): ActionResult {
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
        if (this.time >= this.phaseEndsAt) this.goToLobby();
        break;
      default:
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
    this.events.push({ type: "roundOver", winnerId: outcome.winnerId, draw: outcome.draw });
    return true;
  }

  /** Return to waiting/lobby from countdown or results. */
  private goToLobby(): void {
    this.purgeDisconnected();
    const target = this.connectedPlayers.length >= MIN_PLAYERS ? Phase.Lobby : Phase.Waiting;
    if (!this.transition(target)) return;
    this.phaseEndsAt = 0;
    for (const player of this.players.values()) player.placement = 0;
    this.layoutLobby();
  }

  private refreshLobbyPhase(): void {
    if (this.phase !== Phase.Waiting && this.phase !== Phase.Lobby) return;
    const target = this.connectedPlayers.length >= MIN_PLAYERS ? Phase.Lobby : Phase.Waiting;
    if (target !== this.phase) this.transition(target);
  }

  private purgeDisconnected(): void {
    for (const [id, player] of this.players) if (!player.connected) this.players.delete(id);
    if (!this.players.has(this.hostId)) this.hostId = this.connectedPlayers[0]?.id ?? "";
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
