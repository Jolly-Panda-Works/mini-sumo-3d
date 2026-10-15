import { describe, expect, it } from "vitest";
import { applyArenaEliminations, isOutsideArena, ringPositions } from "../src/simulation/ArenaSystem.js";
import { body, cfg } from "./helpers.js";

const limit = cfg.arenaRadius + cfg.eliminationTolerance;

describe("arena", () => {
  it("players inside the arena stay alive", () => {
    const players = [body("a", 0, 0), body("b", cfg.arenaRadius, 0), body("c", 0, -limit + 0.01)];
    expect(applyArenaEliminations(players, cfg, 100)).toEqual([]);
    expect(players.every((p) => p.alive)).toBe(true);
  });

  it("players beyond the threshold are eliminated", () => {
    const out = body("a", limit + 0.01, 0);
    const diagonal = body("b", limit, limit);
    expect(applyArenaEliminations([out, diagonal], cfg, 500)).toEqual(["a", "b"]);
    expect(out.alive).toBe(false);
    expect(out.eliminatedAt).toBe(500);
    expect(out.vx).toBe(0);
  });

  it("elimination happens only once", () => {
    const out = body("a", limit + 1, 0);
    expect(applyArenaEliminations([out], cfg, 100)).toEqual(["a"]);
    expect(applyArenaEliminations([out], cfg, 200)).toEqual([]);
    expect(out.eliminatedAt).toBe(100);
  });

  it("non-finite positions count as outside", () => {
    expect(isOutsideArena({ x: Number.NaN, y: 0 }, cfg)).toBe(true);
  });

  it("spawn positions are separated and inside the arena", () => {
    for (const n of [2, 3, 4]) {
      const spots = ringPositions(n, cfg.arenaRadius * cfg.spawnRadiusFactor);
      expect(spots).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        expect(isOutsideArena(spots[i]!, cfg)).toBe(false);
        for (let j = i + 1; j < n; j++) {
          expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y)).toBeGreaterThan(cfg.playerRadius * 2);
        }
      }
    }
  });
});
