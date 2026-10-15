import { describe, expect, it } from "vitest";
import { stepMovement } from "../src/simulation/MovementSystem.js";
import { body, cfg } from "./helpers.js";

const dt = 1 / cfg.tickRate;

describe("movement", () => {
  it("zero input creates no acceleration", () => {
    const b = body("a");
    for (let i = 0; i < 30; i++) stepMovement(b, dt, cfg, i * 33);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });

  it("diagonal input is not faster than straight input", () => {
    const straight = body("s", 0, 0, { inputX: 1, inputY: 0 });
    const diagonal = body("d", 0, 0, { inputX: 1, inputY: 1 });
    stepMovement(straight, dt, cfg, 0);
    stepMovement(diagonal, dt, cfg, 0);
    expect(Math.hypot(diagonal.vx, diagonal.vy)).toBeCloseTo(Math.hypot(straight.vx, straight.vy), 6);
  });

  it("enforces maximum speed under sustained input", () => {
    const b = body("a", 0, 0, { inputX: 1, inputY: 0 });
    let maxSeen = 0;
    for (let i = 0; i < 300; i++) {
      stepMovement(b, dt, cfg, i * 33);
      maxSeen = Math.max(maxSeen, Math.hypot(b.vx, b.vy));
    }
    expect(maxSeen).toBeLessThanOrEqual(cfg.maxSpeed + 1e-9);
    expect(maxSeen).toBeGreaterThan(cfg.maxSpeed * 0.8);
  });

  it("input cannot increase speed beyond knockback speed", () => {
    const b = body("a", 0, 0, { vx: 15, vy: 0, inputX: 1, inputY: 0 });
    stepMovement(b, dt, cfg, 0);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(15);
  });

  it("drag slows a moving body without input", () => {
    const b = body("a", 0, 0, { vx: 5 });
    stepMovement(b, dt, cfg, 0);
    expect(b.vx).toBeGreaterThan(0);
    expect(b.vx).toBeLessThan(5);
  });

  it("non-finite input is ignored safely", () => {
    const b = body("a", 0, 0, { inputX: Number.NaN, inputY: Number.POSITIVE_INFINITY });
    stepMovement(b, dt, cfg, 0);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it("over-long input vectors are normalized", () => {
    const big = body("big", 0, 0, { inputX: 50, inputY: 0 });
    const unit = body("unit", 0, 0, { inputX: 1, inputY: 0 });
    stepMovement(big, dt, cfg, 0);
    stepMovement(unit, dt, cfg, 0);
    expect(big.vx).toBeCloseTo(unit.vx, 9);
  });

  it("eliminated bodies do not move", () => {
    const b = body("a", 1, 1, { alive: false, vx: 3, inputX: 1 });
    stepMovement(b, dt, cfg, 0);
    expect(b.x).toBe(1);
  });
});
