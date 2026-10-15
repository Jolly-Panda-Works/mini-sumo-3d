import { describe, expect, it } from "vitest";
import { APPEARANCE_LIMITS, DEFAULT_APPEARANCE, Phase, randomAppearance, sanitizeAppearance } from "@mini-sumo/shared";
import { GameSession } from "../src/game/GameSession.js";
import { cfg, playingSession } from "./helpers.js";

describe("appearance", () => {
  it("sanitizes valid, partial and malformed input", () => {
    expect(sanitizeAppearance({ hair: 2, hairColor: 1, face: 3, outfit: 2 })).toEqual({ hair: 2, hairColor: 1, face: 3, outfit: 2 });
    expect(sanitizeAppearance({ hair: 99, face: -1, outfit: 1.5, hairColor: "2" })).toEqual(DEFAULT_APPEARANCE);
    expect(sanitizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(sanitizeAppearance([1, 2])).toEqual(DEFAULT_APPEARANCE);
  });

  it("random appearances are always valid", () => {
    for (let i = 0; i < 200; i++) {
      const a = randomAppearance();
      for (const key of Object.keys(APPEARANCE_LIMITS) as (keyof typeof APPEARANCE_LIMITS)[]) {
        expect(a[key] >= 0 && a[key] < APPEARANCE_LIMITS[key]).toBe(true);
      }
    }
    expect(randomAppearance(() => 0.999999)).toEqual(sanitizeAppearance(randomAppearance(() => 0.999999)));
  });

  it("is taken from the join options", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A", { hair: 4, hairColor: 2, face: 1, outfit: 3 });
    s.addPlayer("b", "B", { hair: 1000 });
    expect(s.players.get("a")!.appearance).toEqual({ hair: 4, hairColor: 2, face: 1, outfit: 3 });
    expect(s.players.get("b")!.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it("can be changed in the lobby but not during a match", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    expect(s.setAppearance("a", { hair: 2, hairColor: 0, face: 2, outfit: 1 }).ok).toBe(true);
    expect(s.players.get("a")!.appearance.face).toBe(2);
    expect(s.phase).toBe(Phase.Waiting);

    const playing = playingSession(["x", "y"]);
    expect(playing.setAppearance("x", { hair: 3, hairColor: 0, face: 0, outfit: 0 }).ok).toBe(false);
    expect(playing.players.get("x")!.appearance.hair).toBe(0);
  });

  it("bots get a random valid look and cannot be changed through the API", () => {
    const s = new GameSession(cfg, 4, { seed: 3 });
    s.addPlayer("host", "Host");
    s.addBot("host");
    const bot = s.bots[0]!;
    expect(sanitizeAppearance(bot.appearance)).toEqual(bot.appearance);
    expect(s.setAppearance(bot.id, DEFAULT_APPEARANCE).ok).toBe(false);
  });
});
