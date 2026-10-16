import { describe, expect, it } from "vitest";
import { Phase } from "@mini-sumo/shared";
import { GameSession, botSeeksItem } from "../src/game/GameSession.js";
import { advance, cfg, playingSession } from "./helpers.js";

const untilItem = (s: GameSession, limitMs = 30_000) => {
  const end = s.time + limitMs;
  while (!s.item && s.time < end && s.phase === Phase.Playing) s.update(s.stepMs);
  return s.item;
};

describe("power-ups", () => {
  it("a flag appears after the first delay, inside the ring", () => {
    const s = playingSession(["a", "b"]);
    advance(s, cfg.powerUpFirstMs - 200);
    expect(s.item).toBeNull();
    const item = untilItem(s, 1000)!;
    expect(item === null).toBe(false);
    expect(Math.hypot(item.x, item.y)).toBeLessThanOrEqual(cfg.arenaRadius * cfg.powerUpSpawnRadiusFactor + 1e-6);
  });

  it("touching the flag grants its power for the duration, then it ends", () => {
    const s = playingSession(["a", "b"]);
    const item = untilItem(s)!;
    const a = s.players.get("a")!;
    a.x = item.x;
    a.y = item.y;
    s.update(s.stepMs);
    expect(s.item).toBeNull();
    expect(a.powerUp).toBe(item.kind);
    const events = s.drainEvents();
    expect(events.some((e) => e.type === "powerUp" && e.id === "a" && e.active)).toBe(true);
    advance(s, cfg.powerUpDurationMs + 100);
    expect(a.powerUp).toBe("");
    expect(s.drainEvents().some((e) => e.type === "powerUp" && e.id === "a" && !e.active)).toBe(true);
  });

  it("an untouched flag disappears", () => {
    const s = playingSession(["a", "b"]);
    const item = untilItem(s)!;
    for (const p of s.players.values()) {
      p.x = -item.x * 0.2 + (p.id === "a" ? -5 : 5);
      p.y = -item.y * 0.2;
    }
    advance(s, cfg.powerUpItemLifeMs + 100);
    expect(s.drainEvents().some((e) => e.type === "item" && e.state === "expired")).toBe(true);
  });

  it("effects: iron and giant are heavier, giant is bigger, wind is faster, thunder recharges dash fast", () => {
    const s = playingSession(["a", "b"]);
    const a = s.players.get("a")!;
    const give = (kind: "iron" | "giant" | "wind" | "thunder") => {
      a.powerUp = kind;
      a.powerUpUntil = s.time + 5000;
      s.update(s.stepMs);
    };
    give("iron");
    expect(a.massScale).toBe(cfg.ironMassScale);
    give("giant");
    expect(a.radiusScale).toBe(cfg.giantScale);
    expect(a.massScale).toBe(cfg.giantMassScale);
    give("wind");
    expect(a.speedScale).toBe(cfg.windSpeedScale);
    give("thunder");
    expect(s.handleDash("a").ok).toBe(true);
    advance(s, cfg.thunderDashCooldownMs + 50);
    expect(s.handleDash("a").ok).toBe(true);
  });

  it("no new flags in the final stretch", () => {
    const s = playingSession(["a", "b"]);
    while (s.phaseRemainingMs > cfg.lateGameMs) s.update(s.stepMs);
    s.item = null;
    s.drainEvents();
    const spawned: string[] = [];
    while (s.phase === Phase.Playing) {
      s.update(s.stepMs);
      for (const e of s.drainEvents()) if (e.type === "item" && e.state === "spawned") spawned.push(e.kind);
      // Keep everyone far from any flag that might exist.
      if (s.time > 1e9) break;
    }
    expect(spawned).toHaveLength(0);
  });

  it("bots wait their turn: hard goes first, easy last", () => {
    for (const level of ["hard", "normal", "easy"] as const) {
      expect(botSeeksItem(cfg, level, 0)).toBe(false);
      expect(botSeeksItem(cfg, level, cfg.botItemDelayMs[level] - 1)).toBe(false);
      expect(botSeeksItem(cfg, level, cfg.botItemDelayMs[level])).toBe(true);
    }
    expect(cfg.botItemDelayMs.hard).toBeLessThan(cfg.botItemDelayMs.normal);
    expect(cfg.botItemDelayMs.normal).toBeLessThan(cfg.botItemDelayMs.easy);
  });

  it("bots show a level that fits their difficulty", () => {
    for (const [level, max] of [["easy", 4], ["hard", 14]] as const) {
      const s = new GameSession(cfg, 4, { quickMatch: true, seed: 5, botLevel: level });
      s.addPlayer("me", "Me", undefined, 6);
      advance(s, cfg.quickMatchWaitMs + cfg.botJoinIntervalMs * 3 + 100);
      expect(s.players.get("me")!.level).toBe(6);
      for (const bot of s.bots) expect(bot.level).toBeLessThanOrEqual(max);
    }
  });
});
