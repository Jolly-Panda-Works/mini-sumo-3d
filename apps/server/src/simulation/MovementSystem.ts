import type { SimBody } from "./SimBody.js";
import type { SimulationConfig } from "./SimulationConfig.js";

export function isDashing(body: SimBody, timeMs: number): boolean {
  return timeMs < body.dashEndsAt;
}

/** Scale (vx, vy) down to `max` length if needed; non-finite components become 0. */
export function clampVelocity(body: SimBody, max: number): void {
  if (!Number.isFinite(body.vx) || !Number.isFinite(body.vy)) {
    body.vx = 0;
    body.vy = 0;
    return;
  }
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > max) {
    const s = max / speed;
    body.vx *= s;
    body.vy *= s;
  }
}

/**
 * Advance one body by dt seconds: input acceleration, speed cap, drag, integration.
 * Eliminated bodies are not simulated.
 */
export function stepMovement(body: SimBody, dt: number, cfg: SimulationConfig, timeMs: number): void {
  if (!body.alive || !(dt > 0)) return;

  let ix = body.inputX;
  let iy = body.inputY;
  // Stunned (hit by a dash): no steering, the body slides with the hit.
  if (isStunned(body, timeMs)) {
    ix = 0;
    iy = 0;
  }
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) {
    ix = 0;
    iy = 0;
  }
  const inputLength = Math.hypot(ix, iy);
  if (inputLength > 1) {
    ix /= inputLength;
    iy /= inputLength;
  }

  const speedBefore = Math.hypot(body.vx, body.vy);
  const speedScale = body.speedScale ?? 1;
  let vx = body.vx + ix * cfg.acceleration * speedScale * dt;
  let vy = body.vy + iy * cfg.acceleration * speedScale * dt;

  // Input may steer but never push speed beyond max(maxSpeed, current speed).
  const cap = Math.max(speedBefore, cfg.maxSpeed * speedScale);
  const speedAfter = Math.hypot(vx, vy);
  if (speedAfter > cap) {
    const s = cap / speedAfter;
    vx *= s;
    vy *= s;
  }

  const damping = Math.exp(-(isDashing(body, timeMs) ? cfg.dashDrag : cfg.drag) * dt);
  body.vx = vx * damping;
  body.vy = vy * damping;
  clampVelocity(body, cfg.maxVelocity);

  // Rope resistance near the edge (the straw bales): the outward part of the slide is braked,
  // more the closer to the rope. A real hit still goes through; a light shove doesn't.
  const dist = Math.hypot(body.x, body.y);
  const ropeFrom = cfg.arenaRadius * cfg.ropeStart;
  if (dist > ropeFrom && cfg.ropeDrag > 0) {
    const nx = body.x / dist;
    const ny = body.y / dist;
    const outward = body.vx * nx + body.vy * ny;
    if (outward > 0) {
      const depth = Math.min(1, (dist - ropeFrom) / (cfg.arenaRadius - ropeFrom));
      const keep = Math.exp(-cfg.ropeDrag * depth * dt);
      const cut = outward * (1 - keep);
      body.vx -= nx * cut;
      body.vy -= ny * cut;
    }
  }

  body.x += body.vx * dt;
  body.y += body.vy * dt;

  if (inputLength > 0.01 && !isStunned(body, timeMs)) body.angle = Math.atan2(iy, ix);
}

/**
 * Attempt a dash. Returns false (and changes nothing) when the body is eliminated
 * or still cooling down. The dash direction is the current input, else the facing angle.
 */
/** Stunned by a dash hit: no steering, no dash. */
export function isStunned(body: SimBody, timeMs: number): boolean {
  return timeMs < (body.stunnedUntil ?? 0);
}

export function tryDash(body: SimBody, timeMs: number, cfg: SimulationConfig, cooldownMs: number = cfg.dashCooldownMs): boolean {
  if (isStunned(body, timeMs)) return false;
  if (!body.alive) return false;
  if (timeMs < body.dashReadyAt) return false;

  let dx = body.inputX;
  let dy = body.inputY;
  let len = Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : 0;
  if (len < 0.01) {
    dx = Math.cos(body.angle);
    dy = Math.sin(body.angle);
    len = 1;
  }
  dx /= len;
  dy /= len;

  body.vx = dx * cfg.dashSpeed;
  body.vy = dy * cfg.dashSpeed;
  clampVelocity(body, cfg.maxVelocity);
  body.angle = Math.atan2(dy, dx);
  body.dashEndsAt = timeMs + cfg.dashDurationMs;
  body.dashReadyAt = timeMs + Math.max(0, cooldownMs);
  return true;
}
