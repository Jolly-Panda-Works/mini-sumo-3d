import { describe, expect, it } from "vitest";
import { Phase } from "@mini-sumo/shared";
import { GameSession } from "../src/game/GameSession.js";
import { advance, cfg } from "./helpers.js";

const paid = () => new GameSession(cfg, 4, { paidArena: { startDelayMs: 5000, cancelAfterMs: 20_000 }, seed: 1 });

describe("paid arena session", () => {
  it("starts automatically after the delay once two players are in", () => {
    const s = paid();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    expect(s.requestStart("a").ok).toBe(false);
    advance(s, 4800);
    expect(s.phase).toBe(Phase.Lobby);
    advance(s, 400);
    expect(s.phase).toBe(Phase.Countdown);
  });

  it("starts at once when full", () => {
    const s = paid();
    for (const id of ["a", "b", "c", "d"]) s.addPlayer(id, id);
    advance(s, s.stepMs);
    expect(s.phase).toBe(Phase.Countdown);
  });

  it("cancels a lone player and never adds bots", () => {
    const s = paid();
    s.addPlayer("a", "A");
    expect(s.addBot("a").ok).toBe(false);
    advance(s, 19_000);
    expect(s.drainEvents().some((e) => e.type === "cancelled")).toBe(false);
    advance(s, 2000);
    const events = s.drainEvents();
    expect(events.filter((e) => e.type === "cancelled")).toHaveLength(1);
    advance(s, 30_000);
    expect(s.drainEvents().some((e) => e.type === "cancelled")).toBe(false);
    expect(s.bots).toHaveLength(0);
  });

  it("is a single round: no rematch, finished after results", () => {
    const s = paid();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    advance(s, 5000 + cfg.countdownMs + 200);
    expect(s.phase).toBe(Phase.Playing);
    s.players.get("b")!.x = 99;
    advance(s, s.stepMs);
    expect(s.phase).toBe(Phase.RoundOver);
    const over = s.drainEvents().find((e) => e.type === "roundOver");
    expect(over && over.type === "roundOver" && over.winnerId).toBe("a");
    expect(s.requestRematch("a").ok).toBe(false);
    expect(s.requestReturnToLobby("a").ok).toBe(false);
    advance(s, cfg.resultsDurationMs + 200);
    const after = s.drainEvents();
    expect(after.filter((e) => e.type === "finished")).toHaveLength(1);
    expect(s.phase).toBe(Phase.RoundOver);
    advance(s, 5000);
    expect(s.drainEvents().some((e) => e.type === "finished")).toBe(false);
  });

  it("reports the round duration for reward checks", () => {
    const s = paid();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    advance(s, 5000 + cfg.countdownMs + 200);
    s.drainEvents();
    advance(s, 3000);
    s.players.get("b")!.x = 99;
    advance(s, s.stepMs);
    const over = s.drainEvents().find((e) => e.type === "roundOver");
    expect(over && over.type === "roundOver" && over.durationMs > 2900 && over.durationMs < 3300).toBe(true);
  });
});
