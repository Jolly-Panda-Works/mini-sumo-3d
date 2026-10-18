import { describe, expect, it } from "vitest";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };

describe("bout stats and XP", () => {
  it("count every finished bout, even a short one (coins still need a full-length bout)", () => {
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date("2026-10-18T10:00:00Z"));
    const { accountId } = economy.createGuest();
    const result = economy.recordMatchDetailed({
      matchId: "quick",
      durationMs: 6_000,
      rewarded: true,
      participants: [{ accountId, won: true, completed: true }],
      arenaId: "training",
    });
    const profile = economy.profile(accountId);
    expect(profile.stats.matches).toBe(1);
    expect(profile.stats.wins).toBe(1);
    expect(profile.level.xp).toBeGreaterThan(0);
    expect(result.progress.get(accountId)?.xp).toBe(profile.level.xp);
    expect(result.rewards.size).toBe(0);
  });

  it("don't count a bout the player left", () => {
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date("2026-10-18T10:00:00Z"));
    const { accountId } = economy.createGuest();
    economy.recordMatchDetailed({ matchId: "left", durationMs: 40_000, rewarded: true, participants: [{ accountId, won: false, completed: false }] });
    expect(economy.profile(accountId).stats.matches).toBe(0);
  });
});

describe("daily gift", () => {
  it("can be claimed once a day", () => {
    let now = new Date("2026-10-18T10:00:00Z");
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => now, false);
    const { accountId } = economy.createGuest();
    const before = economy.balance(accountId);
    expect(economy.profile(accountId).daily.giftAvailable).toBe(true);
    expect(economy.claimDailyGift(accountId).granted).toBe(100);
    expect(economy.balance(accountId)).toBe(before + 100);
    expect(economy.profile(accountId).daily.giftAvailable).toBe(false);
    expect(() => economy.claimDailyGift(accountId)).toThrow();
    now = new Date("2026-10-19T00:30:00Z");
    expect(economy.profile(accountId).daily.giftAvailable).toBe(true);
  });
});
