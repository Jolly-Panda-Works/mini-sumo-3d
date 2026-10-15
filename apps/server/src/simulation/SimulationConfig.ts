import {
  ARENA_RADIUS,
  COUNTDOWN_MS,
  DASH_COOLDOWN_MS,
  ELIMINATION_TOLERANCE,
  MATCH_DURATION_MS,
  PLAYER_RADIUS,
  QUICK_MATCH_WAIT_MS,
} from "@mini-sumo/shared";

/**
 * Every authoritative gameplay value lives here. Units: metres, seconds (speeds),
 * milliseconds (durations). Tune through playtesting rather than editing systems.
 */
export interface SimulationConfig {
  /** Fixed simulation steps per second. */
  tickRate: number;
  /** Upper bound of fixed steps processed per server update (prevents spiral of death). */
  maxStepsPerUpdate: number;
  /** Real-time deltas larger than this (ms) are clamped, e.g. after a server stall. */
  maxFrameDeltaMs: number;

  arenaRadius: number;
  eliminationTolerance: number;
  playerRadius: number;

  /** Acceleration from full input (m/s^2). */
  acceleration: number;
  /** Speed that input alone can reach (m/s). Knockback may exceed it and decays via drag. */
  maxSpeed: number;
  /** Exponential drag coefficient (1/s). */
  drag: number;
  /** Drag while dashing (1/s). */
  dashDrag: number;
  /** Hard cap on any velocity, including knockback (m/s). */
  maxVelocity: number;

  dashSpeed: number;
  dashDurationMs: number;
  dashCooldownMs: number;

  baseMass: number;
  /** Effective mass while dashing: dashers push harder and bounce back less. */
  dashMass: number;
  /** Bounciness of player collisions (0..1). */
  restitution: number;
  /** Extra separating impulse on impact, scaled by approach speed. */
  pushStrength: number;
  /** Approach speeds (m/s) at or above this produce an "impact" event for clients. */
  impactEventThreshold: number;
  collisionIterations: number;
  /** Max positional correction per pair per iteration (m). */
  maxSeparationPerStep: number;

  countdownMs: number;
  matchDurationMs: number;
  resultsDurationMs: number;

  spawnRadiusFactor: number;
  lobbyRadiusFactor: number;
  /** Timeout tiebreaker: distances to centre closer than this (m) are a draw. */
  timeoutDrawEpsilon: number;

  /** Quick match: wait this long for other players before filling the room with bots. */
  quickMatchWaitMs: number;
  /** Bot reaction delay range (ms between decisions). */
  botThinkMinMs: number;
  botThinkMaxMs: number;

  /** Sustained messages per second per client (input + dash). */
  inputRateLimitPerSec: number;
  /** Token-bucket burst size. */
  inputBurst: number;
}

export const DEFAULT_CONFIG: Readonly<SimulationConfig> = Object.freeze({
  tickRate: 30,
  maxStepsPerUpdate: 4,
  maxFrameDeltaMs: 250,

  arenaRadius: ARENA_RADIUS,
  eliminationTolerance: ELIMINATION_TOLERANCE,
  playerRadius: PLAYER_RADIUS,

  acceleration: 28,
  maxSpeed: 6.5,
  drag: 4,
  dashDrag: 1,
  maxVelocity: 20,

  dashSpeed: 11.5,
  dashDurationMs: 180,
  dashCooldownMs: DASH_COOLDOWN_MS,

  baseMass: 1,
  dashMass: 2.5,
  restitution: 0.35,
  pushStrength: 5,
  impactEventThreshold: 1.5,
  collisionIterations: 3,
  maxSeparationPerStep: 0.6,

  countdownMs: COUNTDOWN_MS,
  matchDurationMs: MATCH_DURATION_MS,
  resultsDurationMs: 20_000,

  spawnRadiusFactor: 0.55,
  lobbyRadiusFactor: 0.45,
  timeoutDrawEpsilon: 0.05,

  quickMatchWaitMs: QUICK_MATCH_WAIT_MS,
  botThinkMinMs: 120,
  botThinkMaxMs: 280,

  inputRateLimitPerSec: 60,
  inputBurst: 30,
});

export function createConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
