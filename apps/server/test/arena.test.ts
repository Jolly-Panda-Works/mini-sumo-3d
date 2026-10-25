import { describe, expect, it } from "vitest";
import { applyArenaEliminations, isOutsideArena, ringPositions } from "../src/simulation/ArenaSystem.js";
import { Phase } from "@mini-sumo/shared";
import { body, cfg, playingSession } from "./helpers.js";

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

describe("shrinking ring", () => {
  it("is full size for most of the bout, then closes in over the final seconds", () => {
    const s = playingSession(["a", "b"]);
    expect(s.ringRadius).toBe(cfg.arenaRadius);
    while (s.phase === Phase.Playing && s.phaseRemainingMs > cfg.shrinkMs + 500) s.update(s.stepMs);
    expect(s.ringRadius).toBe(cfg.arenaRadius);
    while (s.phase === Phase.Playing && s.phaseRemainingMs > cfg.shrinkMs / 2) s.update(s.stepMs);
    expect(s.ringRadius).toBeLessThan(cfg.arenaRadius);
    expect(s.ringRadius).toBeGreaterThan(cfg.arenaRadius * cfg.shrinkTo);
  });

  it("pushes out a wrestler the ring closes past", () => {
    const s = playingSession(["a", "b"]);
    while (s.phase === Phase.Playing && s.phaseRemainingMs > 1000) {
      // a stands still near the edge; b stays in the middle
      const a = s.players.get("a")!;
      const b = s.players.get("b")!;
      if (a.alive) Object.assign(a, { x: cfg.arenaRadius * 0.85, y: 0, vx: 0, vy: 0 });
      Object.assign(b, { x: 0, y: 0, vx: 0, vy: 0 });
      s.update(s.stepMs);
    }
    expect(s.players.get("a")!.alive).toBe(false);
    expect(s.winnerId).toBe("b");
  });

  it("is full size again for the next bout", () => {
    const s = playingSession(["a", "b"]);
    while (s.phase === Phase.Playing) s.update(s.stepMs);
    expect(s.ringRadius).toBeLessThan(cfg.arenaRadius);
    s.requestRematch("a");
    expect(s.ringRadius).toBe(cfg.arenaRadius);
  });
});
