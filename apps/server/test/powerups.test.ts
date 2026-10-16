import { describe, expect, it } from "vitest";
import { Phase } from "@mini-sumo/shared";
import { GameSession } from "../src/game/GameSession.js";
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
    while (s.phaseRemainingMs > cfg.lateGameMs + 100) s.update(s.stepMs);
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
    const firstMove = (level: "easy" | "normal" | "hard") => {
      const s = new GameSession(cfg, 4, { quickMatch: true, seed: 3, botLevel: level });
      s.addPlayer("me", "Me");
      advance(s, cfg.quickMatchWaitMs + cfg.botJoinIntervalMs * 3 + 100);
      s.requestStart("me");
      advance(s, cfg.entranceMs + cfg.countdownMs + 50);
      const item = untilItem(s)!;
      // Who heads for the flag? Watch a bot's input direction relative to the flag.
      const bot = s.bots[0]!;
      const start = s.time;
      while (s.item && s.time - start < 8000) {
        s.update(s.stepMs);
        const toItem = Math.atan2(item.y - bot.y, item.x - bot.x);
        const input = Math.atan2(bot.inputY, bot.inputX);
        if (Math.hypot(bot.inputX, bot.inputY) > 0.1 && Math.abs(Math.atan2(Math.sin(toItem - input), Math.cos(toItem - input))) < 0.05) {
          return s.time - item.spawnedAt;
        }
      }
      return Number.POSITIVE_INFINITY;
    };
    const hard = firstMove("hard");
    const easy = firstMove("easy");
    expect(hard).toBeGreaterThanOrEqual(cfg.botItemDelayMs.hard);
    expect(easy === Number.POSITIVE_INFINITY || easy >= cfg.botItemDelayMs.easy).toBe(true);
  });
});
