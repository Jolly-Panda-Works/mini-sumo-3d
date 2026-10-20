import { describe, expect, it } from "vitest";
import { decideBot, resetBotMemory } from "../src/game/BotBrain.js";
import { resolveCollisions } from "../src/simulation/CollisionSystem.js";
import { isStunned, stepMovement, tryDash } from "../src/simulation/MovementSystem.js";
import { createBody } from "../src/simulation/SimBody.js";
import { createConfig } from "../src/simulation/SimulationConfig.js";

const cfg = createConfig();

describe("hit stun", () => {
  it("a dash into a wrestler who isn't dashing stuns them: no steering, no dash", () => {
    const a = createBody("a", 0, 0);
    const b = createBody("b", cfg.playerRadius * 1.9, 0);
    a.inputX = 1;
    expect(tryDash(a, 0, cfg)).toBe(true);
    const events = resolveCollisions([a, b], cfg, 10);
    expect(events[0]?.stunned).toBe("b");
    expect(isStunned(b, 10)).toBe(true);
    expect(isStunned(b, 10 + cfg.stunMs + 1)).toBe(false);
    // Stunned: input is ignored and a dash is refused
    b.inputX = -1;
    const vxBefore = b.vx;
    stepMovement(b, 1 / 30, cfg, 20);
    expect(b.vx <= vxBefore).toBe(true);
    expect(b.vx > 0).toBe(true); // still sliding with the hit, not steering back
    expect(tryDash(b, 30, cfg)).toBe(false);
  });

  it("two dashes into each other stun nobody", () => {
    const a = createBody("a", 0, 0);
    const b = createBody("b", cfg.playerRadius * 1.9, 0);
    a.inputX = 1;
    b.inputX = -1;
    tryDash(a, 0, cfg);
    tryDash(b, 0, cfg);
    expect(resolveCollisions([a, b], cfg, 10)[0]?.stunned).toBe(undefined);
  });
});

describe("rope resistance", () => {
  it("slows an outward slide near the rope, not in the middle", () => {
    const middle = createBody("m", 0, 0);
    const rope = createBody("r", cfg.arenaRadius * 0.95, 0);
    middle.vx = 6;
    rope.vx = 6;
    stepMovement(middle, 1 / 30, cfg, 0);
    stepMovement(rope, 1 / 30, cfg, 0);
    expect(rope.vx < middle.vx).toBe(true);
    // Moving back toward the middle isn't braked
    const back = createBody("k", cfg.arenaRadius * 0.95, 0);
    back.vx = -6;
    const free = createBody("f", 0, 0);
    free.vx = -6;
    stepMovement(back, 1 / 30, cfg, 0);
    stepMovement(free, 1 / 30, cfg, 0);
    expect(Math.abs(back.vx - free.vx) < 1e-9).toBe(true);
  });
});

describe("bot pacing", () => {
  it("bots don't dash during the opening of a bout", () => {
    let dashes = 0;
    for (let i = 0; i < 200; i++) {
      resetBotMemory();
      const bot = createBody("bot", 0, 0);
      const target = createBody("t", cfg.playerRadius * 3, 0);
      let n = i;
      const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
      if (decideBot(bot, [bot, target], cfg, rng, undefined, { now: 1000, boutMs: 1000, openingMs: cfg.botOpeningMs }).dash) dashes++;
    }
    expect(dashes).toBe(0);
  });
});
