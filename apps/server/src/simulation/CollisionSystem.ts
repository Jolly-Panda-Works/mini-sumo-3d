import { clampVelocity, isDashing } from "./MovementSystem.js";
import type { SimBody } from "./SimBody.js";
import type { SimulationConfig } from "./SimulationConfig.js";

export interface ImpactEvent {
  a: string;
  b: string;
  x: number;
  y: number;
  /** Approach speed along the collision normal (m/s). */
  strength: number;
  /** The wrestler stunned by this hit (a dash into someone who wasn't dashing), if any. */
  stunned?: string;
  /** Two dashes met head-on at about the same moment: both bounce, nobody is stunned. */
  clash?: boolean;
  /** Two dashes met and this wrestler's came later (a counter-dash): the other one is stunned. */
  counter?: string;
}

function massOf(body: SimBody, timeMs: number, cfg: SimulationConfig): number {
  return (isDashing(body, timeMs) ? cfg.dashMass : cfg.baseMass) * (body.massScale ?? 1);
}

/**
 * Circle-vs-circle collision for all alive bodies.
 * - Positional correction separates overlaps (weighted by inverse mass, clamped per step).
 * - On the first iteration, approaching pairs exchange an impulse (restitution) plus a
 *   push bonus proportional to approach speed. Dashing bodies count as heavier.
 * Returns impact events for collisions at or above the configured threshold.
 */
export function resolveCollisions(bodies: readonly SimBody[], cfg: SimulationConfig, timeMs: number): ImpactEvent[] {
  const events: ImpactEvent[] = [];
  const count = bodies.length;

  for (let iter = 0; iter < cfg.collisionIterations; iter++) {
    let overlapped = false;
    for (let i = 0; i < count; i++) {
      const a = bodies[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < count; j++) {
        const b = bodies[j]!;
        if (!b.alive) continue;

        const minDist = cfg.playerRadius * ((a.radiusScale ?? 1) + (b.radiusScale ?? 1));
        const minDistSq = minDist * minDist;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (!(distSq < minDistSq)) continue; // also skips NaN
        overlapped = true;

        let dist = Math.sqrt(distSq);
        let nx: number;
        let ny: number;
        if (dist < 1e-6) {
          // Perfectly stacked: separate along a deterministic axis.
          nx = 1;
          ny = 0;
          dist = 0;
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }

        const invA = 1 / massOf(a, timeMs, cfg);
        const invB = 1 / massOf(b, timeMs, cfg);
        const invSum = invA + invB;

        const correction = Math.min(minDist - dist, cfg.maxSeparationPerStep);
        a.x -= nx * correction * (invA / invSum);
        a.y -= ny * correction * (invA / invSum);
        b.x += nx * correction * (invB / invSum);
        b.y += ny * correction * (invB / invSum);

        if (iter !== 0) continue;

        const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (!(approach > 0)) continue;

        const restitutionImpulse = ((1 + cfg.restitution) * approach) / invSum;
        const pushImpulse = (cfg.pushStrength * Math.min(approach / cfg.maxSpeed, 1.5)) / invSum;
        const impulse = restitutionImpulse + pushImpulse;

        a.vx -= impulse * invA * nx;
        a.vy -= impulse * invA * ny;
        b.vx += impulse * invB * nx;
        b.vy += impulse * invB * ny;
        clampVelocity(a, cfg.maxVelocity);
        clampVelocity(b, cfg.maxVelocity);

        // A dash into someone who isn't dashing stuns them for a moment. Two dashes: the later
        // one (an answer to the other's dash) counters it; at about the same moment, a clash.
        let stunned: string | undefined;
        let counter: string | undefined;
        let clash = false;
        if (approach >= cfg.stunThreshold) {
          const aDash = isDashing(a, timeMs);
          const bDash = isDashing(b, timeMs);
          let victim: SimBody | null = null;
          if (aDash !== bDash) {
            victim = aDash ? b : a;
          } else if (aDash && bDash) {
            // Dashes all last the same, so the one that ends later started later.
            const lead = a.dashEndsAt - b.dashEndsAt;
            if (Math.abs(lead) < cfg.counterLeadMs) {
              clash = true;
            } else {
              const winner = lead > 0 ? a : b;
              victim = winner === a ? b : a;
              counter = winner.id;
              const sign = victim === b ? 1 : -1;
              victim.vx += nx * sign * cfg.counterPush;
              victim.vy += ny * sign * cfg.counterPush;
              clampVelocity(victim, cfg.maxVelocity);
            }
          }
          if (victim) {
            victim.stunnedUntil = timeMs + cfg.stunMs;
            victim.dashEndsAt = Math.min(victim.dashEndsAt, timeMs);
            stunned = victim.id;
          }
        }
        if (approach >= cfg.impactEventThreshold) {
          events.push({
            a: a.id,
            b: b.id,
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            strength: approach,
            ...(stunned ? { stunned } : {}),
            ...(counter ? { counter } : {}),
            ...(clash ? { clash } : {}),
          });
        }
      }
    }
    if (!overlapped) break;
  }
  return events;
}
