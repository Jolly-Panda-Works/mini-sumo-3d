import { describe, expect, it } from "vitest";
import { resolveCollisions } from "../src/simulation/CollisionSystem.js";
import { stepMovement } from "../src/simulation/MovementSystem.js";
import { body, cfg } from "./helpers.js";

const minDist = cfg.playerRadius * 2;
const finite = (...values: number[]) => values.every((v) => Number.isFinite(v));

describe("collision", () => {
  it("separates overlapping players", () => {
    const a = body("a", 0, 0);
    const b = body("b", 0.5, 0);
    resolveCollisions([a, b], cfg, 0);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(minDist - 1e-6);
  });

  it("pushes the target in the direction of the hit", () => {
    const a = body("a", 0, 0, { vx: 6 });
    const b = body("b", minDist - 0.1, 0);
    const events = resolveCollisions([a, b], cfg, 0);
    expect(b.vx).toBeGreaterThan(0);
    expect(Math.abs(b.vy)).toBeLessThan(1e-9);
    expect(b.x).toBeGreaterThan(a.x);
    expect(events).toHaveLength(1);
    expect(events[0]!.strength).toBeCloseTo(6, 6);
  });

  it("head-on collision is symmetric for equal masses", () => {
    const a = body("a", -0.7, 0, { vx: 5 });
    const b = body("b", 0.7, 0, { vx: -5 });
    resolveCollisions([a, b], cfg, 0);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(a.vx).toBeCloseTo(-b.vx, 9);
    expect(a.x).toBeCloseTo(-b.x, 9);
  });

  it("dashing players are heavier and push harder", () => {
    const normalA = body("a", 0, 0, { vx: 6 });
    const normalB = body("b", minDist - 0.05, 0);
    resolveCollisions([normalA, normalB], cfg, 0);

    const dashA = body("a", 0, 0, { vx: 6, dashEndsAt: 1000 });
    const dashB = body("b", minDist - 0.05, 0);
    resolveCollisions([dashA, dashB], cfg, 0);

    expect(dashB.vx).toBeGreaterThan(normalB.vx);
  });

  it("perfectly stacked players separate deterministically without NaN", () => {
    const a = body("a", 1, 1);
    const b = body("b", 1, 1);
    resolveCollisions([a, b], cfg, 0);
    expect(finite(a.x, a.y, b.x, b.y, a.vx, b.vx)).toBe(true);
    expect(b.x).toBeGreaterThan(a.x);
  });

  it("extreme velocities stay finite and bounded", () => {
    const a = body("a", 0, 0, { vx: 1e12, vy: -1e12 });
    const b = body("b", 0.3, 0.3, { vx: -1e12 });
    resolveCollisions([a, b], cfg, 0);
    for (const p of [a, b]) {
      expect(finite(p.x, p.y, p.vx, p.vy)).toBe(true);
      expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(cfg.maxVelocity + 1e-9);
    }
  });

  it("NaN velocity is neutralised rather than spreading", () => {
    const a = body("a", 0, 0, { vx: Number.NaN });
    const b = body("b", 1, 0);
    resolveCollisions([a, b], cfg, 0);
    expect(finite(b.vx, b.vy, b.x, b.y)).toBe(true);
  });

  it("resolves multiple overlapping players", () => {
    const players = [body("a", 0, 0), body("b", 0.3, 0), body("c", 0, 0.3), body("d", 0.2, 0.2)];
    for (let i = 0; i < 20; i++) resolveCollisions(players, cfg, 0);
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p = players[i]!;
        const q = players[j]!;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(minDist - 0.05);
      }
    }
  });

  it("stays stable when pushing against a player at the edge", () => {
    const edge = cfg.arenaRadius - 0.2;
    const pusher = body("a", edge - minDist + 0.1, 0, { inputX: 1 });
    const defender = body("b", edge, 0, { inputX: -1 });
    for (let i = 0; i < 90; i++) {
      stepMovement(pusher, 1 / 30, cfg, i * 33);
      stepMovement(defender, 1 / 30, cfg, i * 33);
      resolveCollisions([pusher, defender], cfg, i * 33);
      expect(finite(pusher.x, defender.x, pusher.vx, defender.vx)).toBe(true);
    }
    // Equal and opposite effort: the defender is not shoved out.
    expect(defender.x).toBeLessThan(cfg.arenaRadius + cfg.eliminationTolerance);
  });

  it("ignores eliminated players", () => {
    const a = body("a", 0, 0);
    const b = body("b", 0.2, 0, { alive: false });
    resolveCollisions([a, b], cfg, 0);
    expect(b.x).toBe(0.2);
    expect(a.x).toBe(0);
  });
});
