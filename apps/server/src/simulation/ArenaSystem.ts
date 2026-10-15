import type { SimBody } from "./SimBody.js";
import type { SimulationConfig } from "./SimulationConfig.js";

export function distanceFromCenter(body: Pick<SimBody, "x" | "y">): number {
  return Math.hypot(body.x, body.y);
}

/** Uses gameplay coordinates only. Non-finite positions count as outside. */
export function isOutsideArena(body: Pick<SimBody, "x" | "y">, cfg: SimulationConfig): boolean {
  const d = distanceFromCenter(body);
  return !Number.isFinite(d) || d > cfg.arenaRadius + cfg.eliminationTolerance;
}

/**
 * Marks alive bodies that left the arena as eliminated (exactly once) and stops them.
 * Returns the ids eliminated during this call.
 */
export function applyArenaEliminations(bodies: readonly SimBody[], cfg: SimulationConfig, timeMs: number): string[] {
  const eliminated: string[] = [];
  for (const body of bodies) {
    if (!body.alive || !isOutsideArena(body, cfg)) continue;
    body.alive = false;
    body.eliminatedAt = timeMs;
    body.vx = 0;
    body.vy = 0;
    body.inputX = 0;
    body.inputY = 0;
    eliminated.push(body.id);
  }
  return eliminated;
}

/** Evenly spaced positions on a circle, each facing the centre. The first slot is on the left. */
export function ringPositions(count: number, radius: number): { x: number; y: number; angle: number }[] {
  const result: { x: number; y: number; angle: number }[] = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.PI + (i * Math.PI * 2) / count;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    result.push({ x, y, angle: Math.atan2(-y, -x) });
  }
  return result;
}
