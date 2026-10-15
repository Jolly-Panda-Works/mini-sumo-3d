import { describe, expect, it } from "vitest";
import { tryDash } from "../src/simulation/MovementSystem.js";
import { advance, body, cfg, playingSession } from "./helpers.js";

describe("dash", () => {
  it("a valid dash is accepted and sets bounded velocity", () => {
    const b = body("a", 0, 0, { inputX: 0, inputY: 1 });
    expect(tryDash(b, 1000, cfg)).toBe(true);
    expect(b.vy).toBeCloseTo(cfg.dashSpeed, 9);
    expect(b.dashEndsAt).toBe(1000 + cfg.dashDurationMs);
    expect(b.dashReadyAt).toBe(1000 + cfg.dashCooldownMs);
  });

  it("dashes along the facing angle when there is no input", () => {
    const b = body("a", 0, 0, { angle: Math.PI });
    tryDash(b, 0, cfg);
    expect(b.vx).toBeCloseTo(-cfg.dashSpeed, 9);
  });

  it("a dash during cooldown is rejected", () => {
    const b = body("a");
    expect(tryDash(b, 0, cfg)).toBe(true);
    b.vx = 0;
    expect(tryDash(b, cfg.dashCooldownMs - 1, cfg)).toBe(false);
    expect(b.vx).toBe(0);
    expect(tryDash(b, cfg.dashCooldownMs, cfg)).toBe(true);
  });

  it("an eliminated player cannot dash", () => {
    expect(tryDash(body("a", 0, 0, { alive: false }), 0, cfg)).toBe(false);
  });

  it("repeated requests through the session do not bypass cooldown", () => {
    const session = playingSession();
    let accepted = 0;
    for (let i = 0; i < 50; i++) if (session.handleDash("a").ok) accepted++;
    expect(accepted).toBe(1);
    advance(session, cfg.dashCooldownMs + 100);
    expect(session.handleDash("a").ok).toBe(true);
  });

  it("dash is rejected outside the playing phase", () => {
    const session = playingSession();
    session.removePlayer("b"); // ends the round
    expect(session.handleDash("a").ok).toBe(false);
  });
});
