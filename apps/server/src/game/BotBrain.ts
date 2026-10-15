import type { SimBody } from "../simulation/SimBody.js";
import type { SimulationConfig } from "../simulation/SimulationConfig.js";

export interface BotDecision {
  x: number;
  y: number;
  dash: boolean;
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
 * Small random noise and a reaction delay (set by the caller) keep it beatable.
 */
export function decideBot(bot: SimBody, opponents: readonly SimBody[], cfg: SimulationConfig, rng: () => number): BotDecision {
  const R = cfg.arenaRadius;
  const botDist = Math.hypot(bot.x, bot.y);

  let dx = -bot.x;
  let dy = -bot.y;
  let dash = false;

  let target: SimBody | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of opponents) {
    if (!o.alive || o.id === bot.id) continue;
    const score = Math.hypot(o.x - bot.x, o.y - bot.y) - 0.8 * Math.hypot(o.x, o.y);
    if (score < bestScore) {
      bestScore = score;
      target = o;
    }
  }

  if (target) {
    const tDist = Math.hypot(target.x, target.y);
    const toTx = target.x - bot.x;
    const toTy = target.y - bot.y;
    const gap = Math.hypot(toTx, toTy);
    const outX = tDist > 0.3 ? target.x / tDist : toTx / (gap || 1);
    const outY = tDist > 0.3 ? target.y / tDist : toTy / (gap || 1);
    const inside = botDist < tDist - 0.3;

    if (inside && gap < cfg.playerRadius * 4) {
      // Charge through the target, outward.
      dx = toTx;
      dy = toTy;
      const align = gap > 0 ? (toTx * outX + toTy * outY) / gap : 0;
      dash = gap < cfg.playerRadius * 3.6 && align > 0.6 && rng() < 0.4;
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

  // Edge safety: blend toward the centre as the bot nears the rope.
  const danger = Math.max(0, Math.min(1, (botDist - R * 0.72) / (R * 0.24)));
  if (danger > 0 && botDist > 1e-6) {
    dx = dx * (1 - danger) - (bot.x / botDist) * danger * 1.5;
    dy = dy * (1 - danger) - (bot.y / botDist) * danger * 1.5;
    if (danger > 0.5) dash = false;
  }

  // Imperfection.
  const noise = (rng() - 0.5) * 0.5;
  const cos = Math.cos(noise);
  const sin = Math.sin(noise);
  const nx = dx * cos - dy * sin;
  const ny = dx * sin + dy * cos;

  len = Math.hypot(nx, ny);
  if (len < 1e-6) return { x: 0, y: 0, dash: false };
  return { x: nx / len, y: ny / len, dash };
}
