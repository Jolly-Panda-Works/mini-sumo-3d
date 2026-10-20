import { describe, expect, it } from "vitest";
import { Phase, computePrize } from "@mini-sumo/shared";
import { getArena } from "../src/economy/config.js";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";
import { GameSession } from "../src/game/GameSession.js";
import { advance, cfg } from "./helpers.js";

const paid = () => new GameSession(cfg, 4, { paidArena: { startDelayMs: 5000, cancelAfterMs: 20_000 }, seed: 1 });

describe("paid arena session", () => {
  it("after the delay, bots fill the empty seats and the bout starts by itself", () => {
    const s = paid();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    expect(s.requestStart("a").ok).toBe(false);
    advance(s, 4800);
    expect(s.phase).toBe(Phase.Lobby);
    expect(s.bots).toHaveLength(0);
    advance(s, 400 + cfg.botJoinIntervalMs * 3 + 200);
    expect(s.bots).toHaveLength(2);
    expect(s.phase).toBe(Phase.Countdown);
  });

  it("starts at once when full", () => {
    const s = paid();
    for (const id of ["a", "b", "c", "d"]) s.addPlayer(id, id);
    advance(s, s.stepMs);
    expect(s.phase).toBe(Phase.Countdown);
  });

  it("a lone player plays against bots after the wait (they can't add bots themselves)", () => {
    const s = paid();
    s.addPlayer("a", "A");
    expect(s.addBot("a").ok).toBe(false);
    advance(s, 19_000); // this test's wait is 20 s (the real game waits 10 s)
    expect(s.bots).toHaveLength(0);
    advance(s, 1_200 + cfg.botJoinIntervalMs * 4 + 200);
    expect(s.bots).toHaveLength(3);
    expect(s.phase).toBe(Phase.Countdown);
    expect(s.drainEvents().some((e) => e.type === "cancelled")).toBe(false);
  });

  it("is a single round: no rematch, finished after results", () => {
    const s = paid();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    advance(s, 5000 + cfg.botJoinIntervalMs * 3 + (cfg.entranceMs + cfg.countdownMs) + 400);
    expect(s.phase).toBe(Phase.Playing);
    for (const p of s.players.values()) if (p.id !== "a") p.x = 99;
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
    // Up to the moment the bout starts (bots fill the seats first)
    while (s.phase !== Phase.Playing) advance(s, s.stepMs);
    s.drainEvents();
    advance(s, 3000);
    for (const p of s.players.values()) if (p.id !== "a") p.x = 99;
    advance(s, s.stepMs);
    const over = s.drainEvents().find((e) => e.type === "roundOver");
    expect(over && over.type === "roundOver" && over.durationMs > 2900 && over.durationMs < 3300).toBe(true);
  });
});

describe("paid arena prize with bots", () => {
  const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };
  const setup = () => {
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date("2026-10-20T10:00:00Z"), false);
    const { accountId } = economy.createGuest();
    const start = economy.balance(accountId);
    const arena = getArena("rookie")!;
    economy.reserveEntry(accountId, "rookie", "room1");
    economy.lockEntries("room1", "m1", [accountId]);
    return { economy, accountId, start, arena };
  };

  it("beating 3 bots pays like beating 3 people (the house pays the bots' share)", () => {
    const { economy, accountId, start, arena } = setup();
    const result = economy.settleMatch({ matchId: "m1", roomId: "room1", arenaId: "rookie", winnerAccountId: accountId, botSeats: 3 });
    const expected = computePrize(arena.entryFee, 4, arena.economyFeePercent).prize;
    expect(result.outcome).toBe("won");
    expect(result.prize).toBe(expected);
    expect(economy.balance(accountId)).toBe(start - arena.entryFee + expected);
    expect(expected > arena.entryFee).toBe(true);
  });

  it("losing to a bot spends the entry (no refund)", () => {
    const { economy, accountId, start, arena } = setup();
    const result = economy.settleMatch({ matchId: "m1", roomId: "room1", arenaId: "rookie", winnerAccountId: null, botSeats: 3, botWon: true });
    expect(result.outcome).toBe("bot_won");
    expect(economy.balance(accountId)).toBe(start - arena.entryFee);
  });
});
