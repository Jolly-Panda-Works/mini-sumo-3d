import { describe, expect, it } from "vitest";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };

function setup() {
  const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date("2026-10-18T10:00:00Z"), false);
  const make = (name: string, xp: number) => {
    const { accountId } = economy.createGuest();
    economy.syncProfile(accountId, { name, appearance: {}, xp, matches: 0, wins: 0, updatedAt: "2026-10-18T09:00:00Z" });
    return accountId;
  };
  return { economy, make };
}

describe("leaderboard", () => {
  it("has 20 bot players whose XP moves once a day", () => {
    let now = new Date("2026-10-18T10:00:00Z");
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => now);
    const { accountId } = economy.createGuest();
    const first = economy.leaderboard(accountId);
    expect(economy.botAccounts()).toHaveLength(20);
    expect(first.total).toBe(20);
    const sameDay = economy.leaderboard(accountId);
    expect(sameDay.top.map((e) => e.xp)).toEqual(first.top.map((e) => e.xp));
    now = new Date("2026-10-19T10:00:00Z");
    const nextDay = economy.leaderboard(accountId);
    const before = new Map(first.top.map((e) => [e.accountId, e.xp]));
    expect(nextDay.top.some((e) => e.xp > (before.get(e.accountId) ?? 0))).toBe(true);
    expect(nextDay.top.every((e) => e.xp >= (before.get(e.accountId) ?? 0))).toBe(true);
  });

  it("ranks players by XP and includes your own row", () => {
    const { economy, make } = setup();
    make("Low", 100);
    const me = make("Me", 500);
    make("Top", 2000);
    const board = economy.leaderboard(me);
    expect(board.top.map((e) => e.name)).toEqual(["Top", "Me", "Low"]);
    expect(board.top.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board.you.rank).toBe(2);
    expect(board.total).toBe(3);
  });

  it("gives your rank when you're outside the top list; equal XP shares a rank", () => {
    const { economy, make } = setup();
    make("A", 900);
    make("B", 900);
    const me = make("Me", 10);
    const board = economy.leaderboard(me, 2);
    expect(board.top).toHaveLength(2);
    expect(board.top.map((e) => e.rank)).toEqual([1, 1]);
    expect(board.you.rank).toBe(3);
  });

  it("leaves out players without a name", () => {
    const { economy, make } = setup();
    economy.createGuest();
    const me = make("Me", 0);
    expect(economy.leaderboard(me).total).toBe(1);
  });
});
