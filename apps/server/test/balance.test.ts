import { describe, expect, it } from "vitest";
import { Phase, sanitizeBotLevel } from "@mini-sumo/shared";
import { BOT_TUNING, decideBot, easedTuning } from "../src/game/BotBrain.js";
import { createRng } from "../src/game/botNames.js";
import { GameSession } from "../src/game/GameSession.js";
import { advance, body, cfg, playingSession } from "./helpers.js";

describe("bot difficulty", () => {
  it("has three levels and sanitises unknown input to normal", () => {
    expect(Object.keys(BOT_TUNING)).toEqual(["easy", "normal", "hard"]);
    expect(sanitizeBotLevel("hard")).toBe("hard");
    expect(sanitizeBotLevel("impossible")).toBe("normal");
    expect(sanitizeBotLevel(undefined)).toBe("normal");
  });

  it("harder levels react faster, steer straighter, dash more and push harder", () => {
    const { easy, normal, hard } = BOT_TUNING;
    for (const key of ["thinkMinMs", "thinkMaxMs", "noise"] as const) {
      expect(easy[key]).toBeGreaterThan(normal[key]);
      expect(normal[key]).toBeGreaterThan(hard[key]);
    }
    for (const key of ["dashChance", "inputScale"] as const) {
      expect(easy[key]).toBeLessThan(normal[key]);
      expect(normal[key]).toBeLessThan(hard[key]);
    }
  });

  it("input stays within the human limit at every level", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const d = decideBot(body("bot", -2, 0), [body("bot", -2, 0), body("t", 2, 0)], cfg, createRng(1), BOT_TUNING[level]);
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(BOT_TUNING[level].inputScale, 6);
      expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(1);
    }
  });

  it("bots ease off at the end of a bout", () => {
    const start = easedTuning("hard", 0);
    const end = easedTuning("hard", 1);
    expect(start).toEqual(BOT_TUNING.hard);
    expect(end.inputScale).toBeLessThan(start.inputScale);
    expect(end.dashChance).toBeLessThan(start.dashChance);
    expect(end.thinkMinMs).toBeGreaterThan(start.thinkMinMs);
  });

  it("the room keeps its level", () => {
    const s = new GameSession(cfg, 4, { botLevel: "easy" });
    expect(s.botLevel).toBe("easy");
    expect(new GameSession(cfg, 4).botLevel).toBe("normal");
  });
});

describe("late-game dash recharge", () => {
  it("is normal for most of the bout and faster in the final stretch", () => {
    const s = playingSession(["a", "b"]);
    expect(s.lateness).toBe(0);
    expect(s.humanDashCooldownMs()).toBe(cfg.dashCooldownMs);
    while (s.phase === Phase.Playing && s.phaseRemainingMs > cfg.lateGameMs / 2) s.update(s.stepMs);
    expect(s.lateness).toBeGreaterThan(0.45);
    expect(s.humanDashCooldownMs()).toBeLessThan(cfg.dashCooldownMs);
    while (s.phase === Phase.Playing && s.phaseRemainingMs > s.stepMs) s.update(s.stepMs);
    expect(s.humanDashCooldownMs()).toBeGreaterThanOrEqual(Math.round(cfg.dashCooldownMs * cfg.lateDashCooldownFactor));
    expect(s.humanDashCooldownMs()).toBeLessThan(cfg.dashCooldownMs * 0.6);
  });

  it("a dash late in the bout recharges sooner and reports its length", () => {
    const s = playingSession(["a", "b"]);
    while (s.phaseRemainingMs > 5000) s.update(s.stepMs);
    const a = s.players.get("a")!;
    expect(s.handleDash("a").ok).toBe(true);
    expect(a.dashCooldownTotal).toBeLessThan(cfg.dashCooldownMs);
    advance(s, a.dashCooldownTotal + 50);
    expect(s.handleDash("a").ok).toBe(true);
  });

  it("does not change bots' dash cooldown", () => {
    const s = new GameSession(cfg, 4, { quickMatch: true, seed: 2, botLevel: "hard" });
    s.addPlayer("me", "Me");
    advance(s, cfg.quickMatchWaitMs + cfg.countdownMs + 200);
    while (s.phase === Phase.Playing && s.phaseRemainingMs > 3000) s.update(s.stepMs);
    for (const bot of s.bots) expect(bot.dashCooldownTotal).toBe(cfg.dashCooldownMs);
  });
});
