import { describe, expect, it } from "vitest";
import { Phase } from "@mini-sumo/shared";
import { GameSession } from "../src/game/GameSession.js";
import { canTransition, computeStandings, determineOutcome } from "../src/simulation/MatchSystem.js";
import { advance, body, cfg, playingSession } from "./helpers.js";

function place(s: GameSession, id: string, x: number, y: number): void {
  const p = s.players.get(id)!;
  p.x = x;
  p.y = y;
}

describe("match state machine", () => {
  it("rejects invalid phase transitions", () => {
    expect(canTransition(Phase.Lobby, Phase.Playing)).toBe(false);
    expect(canTransition(Phase.Playing, Phase.Lobby)).toBe(false);
    expect(canTransition(Phase.Playing, Phase.Playing)).toBe(false);
    expect(canTransition(Phase.Waiting, Phase.Countdown)).toBe(false);
    expect(canTransition(Phase.Lobby, Phase.Countdown)).toBe(true);
    expect(canTransition(Phase.RoundOver, Phase.Countdown)).toBe(true);
  });

  it("cannot start with fewer than two players", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    expect(s.phase).toBe(Phase.Waiting);
    expect(s.requestStart("a").ok).toBe(false);
    expect(s.phase).toBe(Phase.Waiting);
  });

  it("only the host can start", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    expect(s.phase).toBe(Phase.Lobby);
    expect(s.requestStart("b").ok).toBe(false);
    expect(s.requestStart("a").ok).toBe(true);
    expect(s.phase).toBe(Phase.Countdown);
  });

  it("does not start a second countdown", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    s.requestStart("a");
    const round = s.round;
    expect(s.requestStart("a").ok).toBe(false);
    expect(s.round).toBe(round);
  });

  it("countdown transitions into play on time", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    s.requestStart("a");
    advance(s, (cfg.entranceMs + cfg.countdownMs) - 100);
    expect(s.phase).toBe(Phase.Countdown);
    advance(s, 200);
    expect(s.phase).toBe(Phase.Playing);
    expect(s.phaseRemainingMs).toBeGreaterThan(cfg.matchDurationMs - 300);
  });

  it("players are frozen during the countdown", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    s.requestStart("a");
    const a = s.players.get("a")!;
    advance(s, cfg.entranceMs + 100); // walked in from the ring side
    const x = a.x;
    s.handleInput("a", { x: 1, y: 0 });
    advance(s, 1000);
    expect(a.x).toBe(x);
  });

  it("pushing an opponent out makes the last player standing win, once", () => {
    const s = playingSession(["a", "b"]);
    const a = s.players.get("a")!;
    const b = s.players.get("b")!;
    a.x = 4.5;
    a.y = 0;
    b.x = 6;
    b.y = 0;
    s.handleInput("a", { x: 1, y: 0 });
    expect(s.handleDash("a").ok).toBe(true);
    advance(s, 2000);

    expect(b.alive).toBe(false);
    expect(b.elimReason).toBe("ringOut");
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.winnerId).toBe("a");
    expect(s.isDraw).toBe(false);
    expect(s.standings).toEqual(["a", "b"]);
    expect(a.placement).toBe(1);
    expect(b.placement).toBe(2);

    const events = s.drainEvents();
    expect(events.filter((e) => e.type === "roundOver")).toHaveLength(1);
    expect(events.filter((e) => e.type === "eliminated")).toHaveLength(1);
  });

  it("simultaneous eliminations of the last players are a draw", () => {
    const s = playingSession(["a", "b"]);
    const a = s.players.get("a")!;
    const b = s.players.get("b")!;
    a.x = -(cfg.arenaRadius + 1);
    b.x = cfg.arenaRadius + 1;
    advance(s, s.stepMs);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.isDraw).toBe(true);
    expect(s.winnerId).toBe("");
    expect(a.placement).toBe(1);
    expect(b.placement).toBe(1);
  });

  it("timeout picks the player closest to the centre", () => {
    const s = playingSession(["a", "b", "c"], { matchDurationMs: 1000 });
    place(s, "a", 3, 0);
    place(s, "b", -1, 0);
    place(s, "c", 0, 5);
    advance(s, 1200);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.winnerId).toBe("b");
    expect(s.standings).toEqual(["b", "a", "c"]);
  });

  it("timeout with equal distances is a draw", () => {
    const s = playingSession(["a", "b"], { matchDurationMs: 500 });
    place(s, "a", -3, 0);
    place(s, "b", 3, 0);
    advance(s, 700);
    expect(s.isDraw).toBe(true);
    expect(s.winnerId).toBe("");
  });

  it("an elimination on the final tick is counted before the timer", () => {
    const s = playingSession(["a", "b", "c"], { matchDurationMs: 1000 });
    while (s.phaseRemainingMs > s.stepMs) s.update(s.stepMs);
    expect(s.phase).toBe(Phase.Playing);
    place(s, "a", -1, 0);
    place(s, "b", cfg.arenaRadius + 2, 0);
    place(s, "c", 0, 3);
    s.update(s.stepMs); // final tick: ring-out and timer expiry together
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.players.get("b")!.alive).toBe(false);
    expect(s.winnerId).toBe("a");
    expect(s.standings).toEqual(["a", "c", "b"]);
  });

  it("rematch restarts from results; return to lobby resets", () => {
    const s = playingSession(["a", "b"]);
    s.players.get("b")!.x = 50;
    advance(s, s.stepMs);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.requestRematch("b").ok).toBe(false); // not host
    expect(s.requestRematch("a").ok).toBe(true);
    expect(s.phase).toBe(Phase.Countdown);
    expect(s.round).toBe(2);
    expect(s.players.get("b")!.alive).toBe(true);
    expect(s.requestRematch("a").ok).toBe(false); // wrong phase
  });

  it("results return to the lobby automatically", () => {
    const s = playingSession(["a", "b"]);
    s.players.get("b")!.x = 50;
    advance(s, s.stepMs);
    advance(s, cfg.resultsDurationMs + 100);
    expect(s.phase).toBe(Phase.Lobby);
    expect(s.players.get("a")!.placement).toBe(0);
  });

  it("determineOutcome and standings handle edge cases", () => {
    expect(determineOutcome([], cfg)).toEqual({ winnerId: null, draw: true, tiedIds: [] });
    expect(determineOutcome([body("solo", 3, 3)], cfg).winnerId).toBe("solo");
    const standings = computeStandings(
      [
        { id: "w", alive: true, eliminatedAt: -1, x: 0, y: 0 },
        { id: "e1", alive: false, eliminatedAt: 500, x: 0, y: 0 },
        { id: "e2", alive: false, eliminatedAt: 500, x: 0, y: 0 },
        { id: "e3", alive: false, eliminatedAt: 100, x: 0, y: 0 },
      ],
      { winnerId: "w", draw: false, tiedIds: [] },
    );
    expect(standings).toEqual([
      { id: "w", placement: 1 },
      { id: "e1", placement: 2 },
      { id: "e2", placement: 2 },
      { id: "e3", placement: 4 },
    ]);
  });
});

describe("entrance and ring-out credit", () => {
  it("walks everyone from the ring side to the start marks before the 3-2-1", () => {
    const s = new GameSession(cfg, 4);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    const a = s.players.get("a")!;
    const lobbyDist = Math.hypot(a.x, a.y);
    expect(lobbyDist).toBeCloseTo(cfg.arenaRadius * cfg.lobbyRadiusFactor, 3);
    s.requestStart("a");
    advance(s, cfg.entranceMs / 2);
    const mid = Math.hypot(a.x, a.y);
    expect(mid).toBeLessThan(lobbyDist);
    expect(mid).toBeGreaterThan(cfg.arenaRadius * cfg.spawnRadiusFactor);
    advance(s, cfg.entranceMs / 2 + 100);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(cfg.arenaRadius * cfg.spawnRadiusFactor, 3);
    expect(s.phase).toBe(Phase.Countdown);
    expect(s.phaseRemainingMs).toBeLessThanOrEqual(cfg.countdownMs);
  });

  it("credits a ring-out to the last wrestler in contact", () => {
    const s = playingSession(["a", "b", "c"]);
    const a = s.players.get("a")!;
    const b = s.players.get("b")!;
    const c = s.players.get("c")!;
    c.x = -5;
    c.y = 0;
    a.x = 5.4;
    a.y = 0;
    b.x = 6.6;
    b.y = 0;
    s.handleInput("a", { x: 1, y: 0 });
    s.handleDash("a");
    let credit: string | null | undefined;
    for (let i = 0; i < 90 && b.alive; i++) {
      s.update(s.stepMs);
      for (const e of s.drainEvents()) if (e.type === "eliminated" && e.id === "b") credit = e.by;
    }
    expect(b.alive).toBe(false);
    expect(credit).toBe("a");
  });
});
