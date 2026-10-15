import { describe, expect, it } from "vitest";
import { Phase } from "@mini-sumo/shared";
import { GameSession } from "../src/game/GameSession.js";
import { advance, cfg, playingSession } from "./helpers.js";

describe("room session: lobby, host and disconnects", () => {
  it("assigns distinct colours and sanitised default names", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "");
    s.addPlayer("b", "Bo");
    expect(s.players.get("a")!.name).toBe("Sumo 1");
    expect(s.players.get("a")!.colorIndex).toBe(0);
    expect(s.players.get("b")!.colorIndex).toBe(1);
  });

  it("respects the room player limit", () => {
    const s = new GameSession(cfg, 2);
    expect(s.addPlayer("a", "A").ok).toBe(true);
    expect(s.addPlayer("b", "B").ok).toBe(true);
    expect(s.addPlayer("c", "C").ok).toBe(false);
  });

  it("rejects new players during an active match", () => {
    const s = playingSession(["a", "b"]);
    expect(s.addPlayer("late", "Late").ok).toBe(false);
    expect(s.players.has("late")).toBe(false);
  });

  it("lobby leave removes the player and transfers host", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    s.addPlayer("c", "C");
    s.removePlayer("a");
    expect(s.players.has("a")).toBe(false);
    expect(s.hostId).toBe("b");
    s.removePlayer("b");
    expect(s.hostId).toBe("c");
    expect(s.phase).toBe(Phase.Waiting);
  });

  it("reuses freed colour slots", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    s.removePlayer("a");
    s.addPlayer("c", "C");
    expect(s.players.get("c")!.colorIndex).toBe(0);
  });

  it("countdown aborts when a player leaves and fewer than two remain", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    s.requestStart("a");
    s.removePlayer("b");
    expect(s.phase).toBe(Phase.Waiting);
    advance(s, cfg.countdownMs + 500);
    expect(s.phase).toBe(Phase.Waiting);
  });

  it("disconnect during a match eliminates the player and can end the round", () => {
    const s = playingSession(["a", "b", "c"]);
    s.removePlayer("c");
    const c = s.players.get("c")!;
    expect(c.alive).toBe(false);
    expect(c.elimReason).toBe("left");
    expect(s.phase).toBe(Phase.Playing);
    s.removePlayer("b");
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.winnerId).toBe("a");
  });

  it("host disconnect during a match transfers host", () => {
    const s = playingSession(["a", "b", "c"]);
    s.removePlayer("a");
    expect(s.hostId).toBe("b");
  });

  it("the last two players disconnecting leaves a consistent state", () => {
    const s = playingSession(["a", "b"]);
    s.removePlayer("a");
    s.removePlayer("b");
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.hostId).toBe("");
    expect(() => advance(s, cfg.resultsDurationMs + 100)).not.toThrow();
    expect(s.phase).toBe(Phase.Waiting);
    expect(s.players.size).toBe(0);
  });

  it("disconnected players are purged when returning to the lobby", () => {
    const s = playingSession(["a", "b", "c"]);
    s.players.get("c")!.x = 99;
    s.players.get("b")!.x = -99;
    advance(s, s.stepMs);
    expect(s.phase).toBe(Phase.RoundOver);
    s.removePlayer("b");
    expect(s.players.has("b")).toBe(true);
    expect(s.requestReturnToLobby("a").ok).toBe(true);
    expect(s.players.has("b")).toBe(false);
    expect(s.phase).toBe(Phase.Lobby);
  });

  it("malformed and excessive input is rejected", () => {
    const s = playingSession(["a", "b"]);
    expect(s.handleInput("a", { x: "left" })).toBe(false);
    expect(s.handleInput("nobody", { x: 1, y: 0 })).toBe(false);
    let accepted = 0;
    for (let i = 0; i < 500; i++) if (s.handleInput("a", { x: 1, y: 0 })) accepted++;
    expect(accepted).toBeLessThanOrEqual(cfg.inputBurst);
    advance(s, 1000);
    expect(s.handleInput("a", { x: 0, y: 1 })).toBe(true);
  });

  it("eliminated players cannot steer", () => {
    const s = playingSession(["a", "b", "c"]);
    const c = s.players.get("c")!;
    c.x = 99;
    advance(s, s.stepMs);
    expect(c.alive).toBe(false);
    expect(s.handleInput("c", { x: 1, y: 0 })).toBe(false);
    expect(c.inputX).toBe(0);
  });

  it("large server stalls are clamped", () => {
    const s = playingSession(["a", "b"]);
    const before = s.time;
    s.update(60_000);
    expect(s.time - before).toBeLessThanOrEqual(s.stepMs * cfg.maxStepsPerUpdate + 1e-9);
    s.update(Number.NaN);
    s.update(-5);
    expect(Number.isFinite(s.time)).toBe(true);
  });
});
