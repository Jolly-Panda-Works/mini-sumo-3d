import type { BotLevel } from "@mini-sumo/shared";
import type { SimBody } from "../simulation/SimBody.js";
import type { SimulationConfig } from "../simulation/SimulationConfig.js";

export interface BotDecision {
  x: number;
  y: number;
  dash: boolean;
}

/** How strong a bot plays. Every value is applied through the normal input path. */
export interface BotTuning {
  /** Reaction delay range between decisions (ms). */
  thinkMinMs: number;
  thinkMaxMs: number;
  /** Max steering error (radians, full width). */
  noise: number;
  /** Chance to dash when lined up. */
  dashChance: number;
  /** Fraction of full input (below 1 = slower bot). */
  inputScale: number;
  /** Starts retreating at this fraction of the ring radius. */
  edgeStart: number;
  /**
   * How the bot plays, as weights for its moves (picked again every few decisions):
   *  press  - close in and shove (the old behaviour)
   *  stalk  - keep some distance and circle, waiting for an opening
   *  charge - back off, then run in from afar and dash
   */
  style: { press: number; stalk: number; charge: number };
  /** Distance kept while stalking (in player radii). */
  stalkDistance: number;
  /** A charge dashes from this far away (in player radii). */
  chargeDashRange: number;
}

export const BOT_TUNING: Readonly<Record<BotLevel, BotTuning>> = Object.freeze({
  // Easy: hesitant, keeps its distance a lot, charges clumsily from too far.
  easy: {
    thinkMinMs: 240,
    thinkMaxMs: 440,
    noise: 0.95,
    dashChance: 0.15,
    inputScale: 0.72,
    edgeStart: 0.66,
    style: { press: 0.3, stalk: 0.5, charge: 0.2 },
    stalkDistance: 5,
    chargeDashRange: 6,
  },
  // Normal: a mix of pressure, waiting and the odd running charge.
  normal: {
    thinkMinMs: 140,
    thinkMaxMs: 300,
    noise: 0.5,
    dashChance: 0.35,
    inputScale: 0.9,
    edgeStart: 0.72,
    style: { press: 0.36, stalk: 0.36, charge: 0.28 },
    stalkDistance: 4.2,
    chargeDashRange: 4.6,
  },
  // Hard: circles to set up, then well-timed lunges from a distance.
  hard: {
    thinkMinMs: 90,
    thinkMaxMs: 180,
    noise: 0.22,
    dashChance: 0.55,
    inputScale: 1,
    edgeStart: 0.76,
    style: { press: 0.38, stalk: 0.27, charge: 0.35 },
    stalkDistance: 3.6,
    chargeDashRange: 4.4,
  },
});

/**
 * Tuning for a level, eased off by `ease` (0..1): slower reactions, weaker input, fewer dashes.
 * Used for the final stretch of a bout so the ending stays winnable.
 */
export function easedTuning(level: BotLevel, ease: number): BotTuning {
  const t = BOT_TUNING[level];
  const e = Math.max(0, Math.min(1, ease));
  return {
    thinkMinMs: t.thinkMinMs * (1 + 0.6 * e),
    thinkMaxMs: t.thinkMaxMs * (1 + 0.6 * e),
    noise: t.noise * (1 + 0.5 * e),
    dashChance: t.dashChance * (1 - 0.6 * e),
    inputScale: t.inputScale * (1 - 0.3 * e),
    edgeStart: t.edgeStart,
    // Easing off: more waiting, fewer charges.
    style: { press: t.style.press, stalk: t.style.stalk + 0.25 * e, charge: t.style.charge * (1 - 0.5 * e) },
    stalkDistance: t.stalkDistance,
    chargeDashRange: t.chargeDashRange,
  };
}

type Move = "press" | "stalk" | "charge";

interface BotMemory {
  move: Move;
  /** Decisions left in this move. */
  left: number;
  /** Which way to circle while stalking. */
  side: 1 | -1;
  /** A charge first backs off (a few decisions at most), then runs in. */
  phase: "back" | "run";
  backSteps: number;
  /** A little personality per bot: shifts its weights. */
  temper: number;
}

const memory = new Map<string, BotMemory>();

/** Forget a bot (when it leaves); the memory is also rebuilt on demand. */
/** Who each bot is going after, so two bots rarely gang up on the same wrestler. */
const targets = new Map<string, string>();
/** Until when (session time, ms) a bot backs off after a hard hit. */
const recoilUntil = new Map<string, number>();

/** A bot was in a hard hit: it backs off for a moment instead of sticking to its target. */
export function botRecoil(id: string, untilMs: number): void {
  recoilUntil.set(id, untilMs);
}

/** What the bout looks like right now (for pacing). */
export interface BotContext {
  /** Session time (ms). */
  now: number;
  /** Time since the bout started (ms). */
  boutMs: number;
  /** Opening length (ms): circling, no dash. */
  openingMs: number;
}

export function forgetBot(id: string): void {
  targets.delete(id);
  recoilUntil.delete(id);
  memory.delete(id);
}

/** Forget every bot (tests). */
export function resetBotMemory(): void {
  targets.clear();
  recoilUntil.clear();
  memory.clear();
}

function pickMove(tuning: BotTuning, temper: number, rng: () => number): Move {
  // temper > 0: more aggressive (press/charge); < 0: more patient (stalk).
  const press = Math.max(0.05, tuning.style.press * (1 + 0.5 * temper));
  const stalk = Math.max(0.05, tuning.style.stalk * (1 - 0.6 * temper));
  const charge = Math.max(0.05, tuning.style.charge * (1 + 0.4 * temper));
  const r = rng() * (press + stalk + charge);
  return r < press ? "press" : r < press + stalk ? "stalk" : "charge";
}

function movesFor(move: Move, rng: () => number): number {
  // Decisions come every ~0.1–0.45 s depending on the level.
  if (move === "stalk") return 6 + Math.floor(rng() * 8);
  if (move === "charge") return 8 + Math.floor(rng() * 6);
  return 8 + Math.floor(rng() * 10);
}

/**
 * Decides a bot's input. Bots use exactly the same input and physics as humans: this only
 * chooses a direction (length <= 1) and whether to request a dash.
 *
 * Strategy:
 * 1. Target the opponent that is close and near the edge.
 * 2. Approach from the centre side, so a push sends the target outward.
 * 3. Once inside the target, charge straight at it and sometimes dash.
 * 4. The closer the bot is to the edge, the more it steers back to the centre.
 * Noise, a reaction delay and the input scale (from BotTuning) set the difficulty.
 */
export function decideBot(
  bot: SimBody,
  opponents: readonly SimBody[],
  cfg: SimulationConfig,
  rng: () => number,
  tuning: BotTuning = BOT_TUNING.normal,
  ctx?: BotContext,
): BotDecision {
  const R = cfg.arenaRadius;
  const botDist = Math.hypot(bot.x, bot.y);

  let dx = -bot.x;
  let dy = -bot.y;
  let dash = false;

  // What the bot is doing right now (kept for a few decisions, then picked again).
  let mem = memory.get(bot.id);
  if (!mem) {
    // A fresh bot opens by closing in; it mixes things up after that.
    mem = { move: "press", left: movesFor("press", rng), side: rng() < 0.5 ? 1 : -1, phase: "back", backSteps: 0, temper: (rng() - 0.5) * 0.8 };
    memory.set(bot.id, mem);
  }
  if (mem.left <= 0) {
    mem.move = pickMove(tuning, mem.temper, rng);
    mem.left = movesFor(mem.move, rng);
    mem.phase = "back";
    mem.backSteps = 0;
    if (rng() < 0.35) mem.side = mem.side === 1 ? -1 : 1;
  }
  mem.left -= 1;

  let target: SimBody | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of opponents) {
    if (!o.alive || o.id === bot.id) continue;
    let score = Math.hypot(o.x - bot.x, o.y - bot.y) - 0.8 * Math.hypot(o.x, o.y);
    // Another bot is already on them: look for someone else (no ganging up).
    for (const [other, t] of targets) if (other !== bot.id && t === o.id) score += 2.5;
    // A little loyalty to the current target, so bots don't flicker between wrestlers.
    if (targets.get(bot.id) === o.id) score -= 0.6;
    if (score < bestScore) {
      bestScore = score;
      target = o;
    }
  }

  if (target) targets.set(bot.id, target.id);

  // Just hit someone (or got hit): back off toward the middle for a moment.
  if (target && ctx && ctx.now < (recoilUntil.get(bot.id) ?? 0)) {
    const awayX = bot.x - target.x;
    const awayY = bot.y - target.y;
    const len = Math.hypot(awayX, awayY) || 1;
    dx = (awayX / len) * 0.7 - (bot.x / R) * 0.9;
    dy = (awayY / len) * 0.7 - (bot.y / R) * 0.9;
    target = null; // no attack this decision
  }
  // The opening of the bout: size each other up (circle, no dash, no rush to the rope).
  const opening = Boolean(ctx && ctx.boutMs < ctx.openingMs);

  if (target) {
    const tDist = Math.hypot(target.x, target.y);
    const toTx = target.x - bot.x;
    const toTy = target.y - bot.y;
    const gap = Math.hypot(toTx, toTy);
    const outX = tDist > 0.3 ? target.x / tDist : toTx / (gap || 1);
    const outY = tDist > 0.3 ? target.y / tDist : toTy / (gap || 1);
    const inside = botDist < tDist - 0.3;

    const r = cfg.playerRadius;
    // Near the rope the target is easy prey: always press then (not during the opening).
    const move: Move = opening ? "stalk" : tDist > R * 0.72 ? "press" : mem.move;

    if (move === "stalk") {
      // Keep some distance and circle the target, staying on the centre side.
      const want = r * tuning.stalkDistance;
      const ux = toTx / (gap || 1);
      const uy = toTy / (gap || 1);
      const radial = (gap - want) / want; // > 0: too far, < 0: too close
      dx = ux * radial * 1.2 + -uy * mem.side * 0.9;
      dy = uy * radial * 1.2 + ux * mem.side * 0.9;
      // Drift back toward the middle when wandering out.
      dx -= (bot.x / R) * 0.6;
      dy -= (bot.y / R) * 0.6;
      // An opening (target turned close to the edge): finish the wait early.
      if (tDist > R * 0.62) mem.left = Math.min(mem.left, 1);
    } else if (move === "charge") {
      const runUp = r * (tuning.chargeDashRange + 1.5);
      if (mem.phase === "back" && gap < runUp && mem.backSteps < 4) {
        mem.backSteps += 1;
        // Back off first (toward the centre side of the target) to get a run-up.
        dx = -toTx / (gap || 1) - (bot.x / R) * 0.8;
        dy = -toTy / (gap || 1) - (bot.y / R) * 0.8;
      } else {
        mem.phase = "run";
        dx = toTx;
        dy = toTy;
        // Dash once in range and lined up with the target.
        dash = gap < r * tuning.chargeDashRange && gap > r * 2.6 && rng() < Math.min(0.95, tuning.dashChance + 0.35);
        if (dash) mem.left = Math.min(mem.left, 2); // after the lunge, think again
      }
    } else if (inside && gap < cfg.playerRadius * 4) {
      // Charge through the target, outward.
      dx = toTx;
      dy = toTy;
      const align = gap > 0 ? (toTx * outX + toTy * outY) / gap : 0;
      dash = gap < cfg.playerRadius * 3.6 && align > 0.6 && rng() < tuning.dashChance;
    } else {
      // Get between the target and the centre first.
      dx = target.x - outX * cfg.playerRadius * 1.8 - bot.x;
      dy = target.y - outY * cfg.playerRadius * 1.8 - bot.y;
    }
  }

  let len = Math.hypot(dx, dy);
  if (len > 1e-6) {
    dx /= len;
    dy /= len;
  }

  if (opening) dash = false;

  // Edge safety: blend toward the centre as the bot nears the rope.
  const span = Math.max(0.1, 0.96 - tuning.edgeStart);
  const danger = Math.max(0, Math.min(1, (botDist - R * tuning.edgeStart) / (R * span)));
  if (danger > 0 && botDist > 1e-6) {
    dx = dx * (1 - danger) - (bot.x / botDist) * danger * 1.5;
    dy = dy * (1 - danger) - (bot.y / botDist) * danger * 1.5;
    if (danger > 0.5) dash = false;
  }

  // Imperfection.
  const noise = (rng() - 0.5) * tuning.noise;
  const cos = Math.cos(noise);
  const sin = Math.sin(noise);
  const nx = dx * cos - dy * sin;
  const ny = dx * sin + dy * cos;

  len = Math.hypot(nx, ny);
  if (len < 1e-6) return { x: 0, y: 0, dash: false };
  const scale = Math.max(0, Math.min(1, tuning.inputScale)) / len;
  return { x: nx * scale, y: ny * scale, dash };
}
