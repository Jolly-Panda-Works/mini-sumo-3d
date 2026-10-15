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
  let vx = body.vx + ix * cfg.acceleration * dt;
  let vy = body.vy + iy * cfg.acceleration * dt;

  // Input may steer but never push speed beyond max(maxSpeed, current speed).
  const cap = Math.max(speedBefore, cfg.maxSpeed);
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

  body.x += body.vx * dt;
  body.y += body.vy * dt;

  if (inputLength > 0.01) body.angle = Math.atan2(iy, ix);
}

/**
 * Attempt a dash. Returns false (and changes nothing) when the body is eliminated
 * or still cooling down. The dash direction is the current input, else the facing angle.
 */
export function tryDash(body: SimBody, timeMs: number, cfg: SimulationConfig): boolean {
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
  body.dashReadyAt = timeMs + cfg.dashCooldownMs;
  return true;
}
