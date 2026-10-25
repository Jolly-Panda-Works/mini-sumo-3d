import {
  ARENA_RADIUS,
  COUNTDOWN_MS,
  DASH_COOLDOWN_MS,
  ELIMINATION_TOLERANCE,
  MATCH_DURATION_MS,
  PLAYER_RADIUS,
  QUICK_MATCH_WAIT_MS,
  LATE_GAME_MS,
  POWER_UP_MS,
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
  /** A dash that hits a wrestler who isn't dashing this hard (m/s) stuns them. */
  stunThreshold: number;
  /** How long a stun lasts (ms): no steering and no dash, the body slides with the hit. */
  stunMs: number;
  /** Rope resistance (like the straw bales): from this fraction of the ring radius outward… */
  ropeStart: number;
  /** …the outward slide is braked this hard (1/s at the rope; ramps up from ropeStart). */
  ropeDrag: number;
  /** Max positional correction per pair per iteration (m). */
  maxSeparationPerStep: number;
  /**
   * Counter-dash: when two dashes meet, the one that started at least this much later (ms) is
   * the counter (a dash in answer to theirs): the earlier dasher is stunned and thrown back.
   * Closer than this, it's a clash: both bounce, nobody is stunned.
   */
  counterLeadMs: number;
  /** Extra throw (m/s) on the wrestler who was countered. */
  counterPush: number;

  /** Shrinking ring: over the final this-many ms of a bout the ring closes in… */
  shrinkMs: number;
  /** …down to this fraction of its radius. */
  shrinkTo: number;

  /** Walk from the ring side to the start marks before the 3-2-1 (ms). */
  entranceMs: number;
  countdownMs: number;
  matchDurationMs: number;
  resultsDurationMs: number;

  spawnRadiusFactor: number;
  lobbyRadiusFactor: number;
  /** Timeout tiebreaker: distances to centre closer than this (m) are a draw. */
  timeoutDrawEpsilon: number;

  /** Quick match: wait this long for other players before filling the room with bots. */
  quickMatchWaitMs: number;
  /** Bots join one by one this far apart (ms). */
  botJoinIntervalMs: number;
  /** A ring-out counts for the last wrestler who touched you within this time (ms). */
  ringOutCreditMs: number;
  /** Bots size each other up this long at the start of a bout (ms): circling, no dash. */
  botOpeningMs: number;
  /** After a hard hit a bot backs off this long (ms) instead of sticking to its target. */
  botRecoilMs: number;
  /** Bot reaction delay range (ms between decisions). */
  botThinkMinMs: number;
  botThinkMaxMs: number;

  /** Final stretch of a bout (ms before the timer ends). */
  lateGameMs: number;
  /** Human dash cooldown multiplier at the very end (ramps from 1 during the final stretch). */
  lateDashCooldownFactor: number;
  /** How much bots ease off at the very end (0 = not at all, 1 = fully). */
  lateBotEase: number;

  /** Power-ups */
  powerUpsEnabled: boolean;
  /** First flag this long after the bout starts, then every min..max ms. */
  powerUpFirstMs: number;
  powerUpEveryMinMs: number;
  powerUpEveryMaxMs: number;
  /** A flag nobody grabs disappears after this long. */
  powerUpItemLifeMs: number;
  powerUpDurationMs: number;
  /** Flags appear within this fraction of the ring radius. */
  powerUpSpawnRadiusFactor: number;
  powerUpPickupRange: number;
  /** Bots go for a flag only after this delay (players get the first chance). */
  botItemDelayMs: { easy: number; normal: number; hard: number };
  ironMassScale: number;
  giantScale: number;
  giantMassScale: number;
  windSpeedScale: number;
  thunderDashCooldownMs: number;

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
  restitution: 0.45,
  pushStrength: 6.5,
  impactEventThreshold: 1.5,
  collisionIterations: 3,
  stunThreshold: 5,
  stunMs: 650,
  ropeStart: 0.8,
  ropeDrag: 8,
  maxSeparationPerStep: 0.6,
  counterLeadMs: 60,
  counterPush: 4,

  shrinkMs: 20_000,
  shrinkTo: 0.72,

  entranceMs: 1600,
  countdownMs: COUNTDOWN_MS,
  matchDurationMs: MATCH_DURATION_MS,
  resultsDurationMs: 20_000,

  spawnRadiusFactor: 0.55,
  lobbyRadiusFactor: 0.86,
  timeoutDrawEpsilon: 0.05,

  quickMatchWaitMs: QUICK_MATCH_WAIT_MS,
  botJoinIntervalMs: 650,
  ringOutCreditMs: 2500,
  botOpeningMs: 3_000,
  botRecoilMs: 700,
  botThinkMinMs: 120,
  botThinkMaxMs: 280,

  lateGameMs: LATE_GAME_MS,
  lateDashCooldownFactor: 0.55,
  lateBotEase: 1,

  powerUpsEnabled: true,
  powerUpFirstMs: 8_000,
  powerUpEveryMinMs: 8_000,
  powerUpEveryMaxMs: 12_000,
  powerUpItemLifeMs: 8_000,
  powerUpDurationMs: POWER_UP_MS,
  powerUpSpawnRadiusFactor: 0.6,
  powerUpPickupRange: 0.55,
  botItemDelayMs: { hard: 1_500, normal: 3_000, easy: 4_500 },
  ironMassScale: 2,
  giantScale: 1.4,
  giantMassScale: 1.7,
  windSpeedScale: 1.4,
  thunderDashCooldownMs: 800,

  inputRateLimitPerSec: 60,
  inputBurst: 30,
});

export function createConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
