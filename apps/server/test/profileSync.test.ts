import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "@mini-sumo/shared";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };

function setup() {
  let clock = new Date("2026-10-18T10:00:00Z");
  const economy = new Economy(":memory:", FLAGS, silentEventSink, () => clock);
  const { accountId } = economy.createGuest();
  return { economy, accountId, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

const sync = (updatedAt: string, extra: Record<string, unknown> = {}) => ({
  name: "Usef",
  appearance: { ...DEFAULT_APPEARANCE, avatar: 2 },
  xp: 0,
  matches: 0,
  wins: 0,
  updatedAt,
  ...extra,
});

describe("profile sync", () => {
  it("takes a newer name and look from the device", () => {
    const { economy, accountId } = setup();
    const profile = economy.syncProfile(accountId, sync("2026-10-18T09:00:00Z"));
    expect(profile.name).toBe("Usef");
    expect(profile.appearance.avatar).toBe(2);
    expect(profile.profileUpdatedAt).toBe("2026-10-18T09:00:00.000Z");
  });

  it("keeps the server's name and look when the device's copy is older", () => {
    const { economy, accountId } = setup();
    economy.syncProfile(accountId, sync("2026-10-18T09:00:00Z", { name: "Newer" }));
    const profile = economy.syncProfile(accountId, sync("2026-10-18T08:00:00Z", { name: "Older" }));
    expect(profile.name).toBe("Newer");
  });

  it("keeps the higher XP and stats, never lowering them", () => {
    const { economy, accountId } = setup();
    economy.syncProfile(accountId, sync("2026-10-18T09:00:00Z", { xp: 900, matches: 12, wins: 5 }));
    const profile = economy.syncProfile(accountId, sync("2026-10-18T09:30:00Z", { xp: 100, matches: 3, wins: 1 }));
    expect(profile.level.xp).toBe(900);
    expect(profile.stats.matches).toBe(12);
    expect(profile.stats.wins).toBe(5);
  });

  it("ignores a clock far in the future and unowned items", () => {
    const { economy, accountId } = setup();
    const profile = economy.syncProfile(accountId, sync("2030-01-01T00:00:00Z", { name: "Cheater" }));
    expect(profile.name).toBe("");
    const owned = economy.syncProfile(accountId, sync("2026-10-18T09:00:00Z", { appearance: { ...DEFAULT_APPEARANCE, avatar: 39 } }));
    expect(owned.appearance.avatar).toBe(0);
  });

  it("does not grant coins for synced XP", () => {
    const { economy, accountId } = setup();
    const before = economy.profile(accountId).balances.coins;
    economy.syncProfile(accountId, sync("2026-10-18T09:00:00Z", { xp: 50_000 }));
    expect(economy.profile(accountId).balances.coins).toBe(before);
  });
});
