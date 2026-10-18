import { describe, expect, it } from "vitest";
import { Currency, levelUpCoins } from "@mini-sumo/shared";
import { CATALOG, ECONOMY, getArena } from "../src/economy/config.js";
import { Economy, EconomyError } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";
import { PaymentService } from "../src/economy/payments.js";
import { computePrize } from "../src/economy/prize.js";

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };
const ROOKIE = getArena("rookie")!;
const F = ROOKIE.entryFee;

function setup(flags = FLAGS) {
  let clock = new Date("2026-10-15T10:00:00Z");
  const economy = new Economy(":memory:", flags, silentEventSink, () => clock);
  return {
    economy,
    advanceDays: (days: number) => {
      clock = new Date(clock.getTime() + days * 86_400_000);
    },
  };
}

function player(economy: Economy, coins?: number) {
  const { accountId, token } = economy.createGuest();
  const diff = coins === undefined ? 0 : coins - economy.balance(accountId);
  if (diff !== 0) {
    // test-only adjustment through the public API surface: use purchases/entries elsewhere
    (economy as unknown as { apply: (i: object) => void }).apply({
      accountId,
      currency: Currency.Coins,
      amount: diff,
      category: "adjustment",
      reason: "test",
      key: `test:${accountId}:${coins}`,
    });
  }
  return { accountId, token };
}

const expectCode = (fn: () => unknown, code: EconomyError["code"]) => {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught instanceof EconomyError && caught.code === code).toBe(true);
};

describe("accounts and wallet", () => {
  it("guest accounts get the welcome grant once and authenticate by token only", () => {
    const { economy } = setup();
    const { accountId, token } = economy.createGuest();
    expect(economy.balance(accountId)).toBe(ECONOMY.welcomeCoins);
    expect(economy.authenticate(token)).toBe(accountId);
    expect(economy.authenticate(accountId)).toBeNull();
    expect(economy.authenticate("x".repeat(43))).toBeNull();
    expect(economy.authenticate(undefined)).toBeNull();
    expect(economy.ledgerSum(accountId)).toBe(economy.balance(accountId));
  });

  it("currencies are separate and premium currency is disabled", () => {
    const { economy } = setup();
    const { accountId } = economy.createGuest();
    expect(economy.profile(accountId).balances).toEqual({ coins: ECONOMY.welcomeCoins, gems: 0 });
    expectCode(
      () =>
        (economy as unknown as { apply: (i: object) => void }).apply({
          accountId,
          currency: Currency.Gems,
          amount: 100,
          category: "adjustment",
          reason: "x",
          key: "gems",
        }),
      "currency_disabled",
    );
    expect(economy.balance(accountId, Currency.Gems)).toBe(0);
  });

  it("rejects invalid amounts and never goes below zero", () => {
    const { economy } = setup();
    const a = player(economy, 50);
    const apply = (amount: number, key: string) =>
      (economy as unknown as { apply: (i: object) => void }).apply({
        accountId: a.accountId,
        currency: Currency.Coins,
        amount,
        category: "adjustment",
        reason: "x",
        key,
      });
    expectCode(() => apply(1.5, "k1"), "invalid_amount");
    expectCode(() => apply(0, "k2"), "invalid_amount");
    expectCode(() => apply(-51, "k3"), "insufficient_funds");
    expect(economy.balance(a.accountId)).toBe(50);
    expect(economy.ledgerSum(a.accountId)).toBe(50);
  });
});

describe("prize formula", () => {
  it("matches the documented examples and conserves the pool", () => {
    expect(computePrize(100, 4, 10)).toEqual({ pool: 400, prize: 360, sink: 40 });
    expect(computePrize(100, 2, 10)).toEqual({ pool: 200, prize: 180, sink: 20 });
    for (const [fee, players, pct] of [
      [7, 3, 10],
      [333, 3, 15],
      [1, 2, 99],
      [2000, 4, 0],
    ] as const) {
      const r = computePrize(fee, players, pct);
      expect(r.prize + r.sink).toBe(r.pool);
      expect(r.prize).toBeLessThanOrEqual(r.pool);
      expect(Number.isInteger(r.prize)).toBe(true);
    }
    expect(() => computePrize(1.5, 2, 10)).toThrow();
  });
});

describe("arena entry", () => {
  it("charges an affordable entry exactly once per room", () => {
    const { economy } = setup();
    const a = player(economy, 300);
    economy.reserveEntry(a.accountId, "rookie", "room1");
    expect(economy.balance(a.accountId)).toBe(300 - F);
    expectCode(() => economy.reserveEntry(a.accountId, "rookie", "room1"), "already_entered");
    expect(economy.balance(a.accountId)).toBe(300 - F);
  });

  it("rejects unaffordable, unknown, disabled and locked arenas without charging", () => {
    const { economy } = setup();
    const poor = player(economy, F - 10);
    expectCode(() => economy.reserveEntry(poor.accountId, "rookie", "r"), "insufficient_funds");
    expectCode(() => economy.reserveEntry(poor.accountId, "nope", "r"), "unknown_arena");
    const rich = player(economy, 5000);
    expectCode(() => economy.reserveEntry(rich.accountId, "champion", "r"), "arena_locked");
    expect(economy.balance(poor.accountId)).toBe(F - 10);
    expect(economy.balance(rich.accountId)).toBe(5000);
    const off = setup({ ...FLAGS, economy: false }).economy;
    const p = player(off, 500);
    expectCode(() => off.reserveEntry(p.accountId, "rookie", "r"), "disabled");
  });

  it("two simultaneous entries can't spend the same balance twice", async () => {
    const { economy } = setup();
    const a = player(economy, F + F / 2);
    const attempts = await Promise.allSettled(
      ["roomA", "roomB", "roomC"].map(async (room) => economy.reserveEntry(a.accountId, "rookie", room)),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(economy.balance(a.accountId)).toBe(F / 2);
    expect(economy.ledgerSum(a.accountId)).toBe(F / 2);
  });

  it("leaving before the bout refunds once; after the bout starts it doesn't", () => {
    const { economy } = setup();
    const a = player(economy, 300);
    economy.reserveEntry(a.accountId, "rookie", "room1");
    expect(economy.refundReserved("room1", a.accountId)).toBe(F);
    expect(economy.refundReserved("room1", a.accountId)).toBe(0);
    expect(economy.balance(a.accountId)).toBe(300);

    economy.reserveEntry(a.accountId, "rookie", "room2");
    economy.lockEntries("room2", "room2:1", [a.accountId]);
    expect(economy.refundReserved("room2", a.accountId)).toBe(0);
    expect(economy.balance(a.accountId)).toBe(300 - F);
  });

  it("a cancelled room refunds everyone exactly once", () => {
    const { economy } = setup();
    const a = player(economy, 300);
    const b = player(economy, 300);
    economy.reserveEntry(a.accountId, "rookie", "room");
    economy.reserveEntry(b.accountId, "rookie", "room");
    expect(economy.refundRoom("room", "cancelled")).toBe(2 * F);
    expect(economy.refundRoom("room", "cancelled")).toBe(0);
    expect(economy.balance(a.accountId)).toBe(300);
    expect(economy.balance(b.accountId)).toBe(300);
    expect(economy.ledgerSum(a.accountId)).toBe(300);
  });

  it("startup recovery refunds entries of rooms lost in a restart", () => {
    const { economy } = setup();
    const a = player(economy, 300);
    economy.reserveEntry(a.accountId, "rookie", "lost1");
    const b = player(economy, 300);
    economy.reserveEntry(b.accountId, "rookie", "lost2");
    economy.lockEntries("lost2", "lost2:1", [b.accountId]);
    expect(economy.recoverOrphanedEntries()).toBe(2);
    expect(economy.balance(a.accountId)).toBe(300);
    expect(economy.balance(b.accountId)).toBe(300);
    expect(economy.recoverOrphanedEntries()).toBe(0);
  });
});

describe("settlement", () => {
  function match(economy: Economy, players: number, room = "room") {
    const accounts = Array.from({ length: players }, () => player(economy, 1000));
    for (const a of accounts) economy.reserveEntry(a.accountId, "rookie", room);
    economy.lockEntries(room, `${room}:1`, accounts.map((a) => a.accountId));
    return accounts;
  }

  it("pays the winner the pool minus the economy fee", () => {
    const { economy } = setup();
    const [w, l1, l2, l3] = match(economy, 4);
    const s = economy.settleMatch({ matchId: "room:1", roomId: "room", arenaId: "rookie", winnerAccountId: w!.accountId });
    expect(s).toMatchObject({ outcome: "won", players: 4, pool: 4 * F, prize: Math.floor(4 * F * 0.9), sink: 4 * F - Math.floor(4 * F * 0.9), created: true });
    expect(economy.balance(w!.accountId)).toBe(1000 - F + Math.floor(4 * F * 0.9));
    for (const l of [l1, l2, l3]) expect(economy.balance(l!.accountId)).toBe(1000 - F);
    expect(economy.ledgerSum(w!.accountId)).toBe(economy.balance(w!.accountId));
  });

  it("settles exactly once, even with a different winner on retry", () => {
    const { economy } = setup();
    const [a, b] = match(economy, 2);
    economy.settleMatch({ matchId: "room:1", roomId: "room", arenaId: "rookie", winnerAccountId: a!.accountId });
    const again = economy.settleMatch({ matchId: "room:1", roomId: "room", arenaId: "rookie", winnerAccountId: b!.accountId });
    expect(again.created).toBe(false);
    expect(again.winnerAccountId).toBe(a!.accountId);
    expect(economy.balance(a!.accountId)).toBe(1000 - F + Math.floor(2 * F * 0.9));
    expect(economy.balance(b!.accountId)).toBe(1000 - F);
  });

  it("refunds everyone on a draw", () => {
    const { economy } = setup();
    const players = match(economy, 3);
    const s = economy.settleMatch({ matchId: "room:1", roomId: "room", arenaId: "rookie", winnerAccountId: null });
    expect(s.outcome).toBe("draw");
    for (const p of players) expect(economy.balance(p.accountId)).toBe(1000);
  });

  it("an invalid winner voids the match and refunds", () => {
    const { economy } = setup();
    const players = match(economy, 2);
    const outsider = player(economy, 0);
    const s = economy.settleMatch({ matchId: "room:1", roomId: "room", arenaId: "rookie", winnerAccountId: outsider.accountId });
    expect(s.outcome).toBe("void");
    expect(economy.balance(outsider.accountId)).toBe(0);
    for (const p of players) expect(economy.balance(p.accountId)).toBe(1000);
  });

  it("a refunded player can't also be paid, and a settled match can't be refunded", () => {
    const { economy } = setup();
    const [a, b] = match(economy, 2);
    economy.settleMatch({ matchId: "room:1", roomId: "room", arenaId: "rookie", winnerAccountId: a!.accountId });
    expect(economy.refundRoom("room", "late refund")).toBe(0);
    expect(economy.balance(a!.accountId)).toBe(1000 - F + Math.floor(2 * F * 0.9));
    expect(economy.balance(b!.accountId)).toBe(1000 - F);
  });
});

describe("free rewards", () => {
  const participants = (ids: string[], winner?: string) => ids.map((id) => ({ accountId: id, won: id === winner, completed: true }));

  it("grants participation, win and the daily bonus once per match", () => {
    const { economy } = setup();
    const a = player(economy, 0);
    const b = player(economy, 0);
    const r = ECONOMY.rewards;
    const first = economy.recordMatch({ matchId: "m1", durationMs: 30_000, rewarded: true, participants: participants([a.accountId, b.accountId], a.accountId) });
    expect(first.get(a.accountId)).toBe(r.participation + r.win + r.firstMatchOfDay);
    expect(first.get(b.accountId)).toBe(r.participation + r.firstMatchOfDay);
    const repeat = economy.recordMatch({ matchId: "m1", durationMs: 30_000, rewarded: true, participants: participants([a.accountId], a.accountId) });
    expect(repeat.size).toBe(0);
    expect(economy.profile(a.accountId).stats).toMatchObject({ matches: 1, wins: 1 });
    expect(economy.profile(a.accountId).level.xp).toBe(50);
    const second = economy.recordMatch({ matchId: "m2", durationMs: 30_000, rewarded: true, participants: participants([a.accountId]) });
    expect(second.get(a.accountId)).toBe(r.participation);
  });

  it("pays no coins for short rounds or players who left (short rounds still count for stats)", () => {
    const { economy } = setup();
    const a = player(economy, 0);
    const b = player(economy, 0);
    const short = economy.recordMatch({ matchId: "s", durationMs: 5000, rewarded: true, participants: participants([a.accountId]) });
    expect(short.size).toBe(0);
    const left = economy.recordMatch({
      matchId: "l",
      durationMs: 60_000,
      rewarded: true,
      participants: [{ accountId: b.accountId, won: false, completed: false }],
    });
    expect(left.size).toBe(0);
    expect(economy.profile(a.accountId).stats.matches).toBe(1);
    expect(economy.profile(b.accountId).stats.matches).toBe(0);
  });

  it("caps free rewards per day and resets the next day", () => {
    const { economy, advanceDays } = setup();
    const a = player(economy, 0);
    let total = 0;
    for (let i = 0; i < 40; i++) {
      total += economy.recordMatch({ matchId: `m${i}`, durationMs: 30_000, rewarded: true, participants: participants([a.accountId], a.accountId) }).get(a.accountId) ?? 0;
    }
    expect(total).toBe(ECONOMY.rewards.dailyCap);
    advanceDays(1);
    const next = economy.recordMatch({ matchId: "next", durationMs: 30_000, rewarded: true, participants: participants([a.accountId]) });
    expect(next.get(a.accountId)).toBe(ECONOMY.rewards.participation + ECONOMY.rewards.firstMatchOfDay);
  });
});

describe("cosmetic shop", () => {
  const priced = CATALOG.find((i) => i.price > 0 && i.price <= 300)!;

  it("buys an item, persists ownership and charges once for repeated requests", () => {
    const { economy } = setup();
    const a = player(economy, 1000);
    const first = economy.purchase(a.accountId, priced.id, "purchase-key-1");
    expect(first.alreadyOwned).toBe(false);
    expect(economy.balance(a.accountId)).toBe(1000 - priced.price);
    const retry = economy.purchase(a.accountId, priced.id, "purchase-key-1");
    const again = economy.purchase(a.accountId, priced.id, "purchase-key-2");
    expect(retry.alreadyOwned).toBe(true);
    expect(again.alreadyOwned).toBe(true);
    expect(economy.balance(a.accountId)).toBe(1000 - priced.price);
    expect(economy.owned(a.accountId).has(priced.id)).toBe(true);
    expect(economy.ledgerSum(a.accountId)).toBe(economy.balance(a.accountId));
  });

  it("concurrent purchases of the same item charge once", async () => {
    const { economy } = setup();
    const a = player(economy, 1000);
    await Promise.allSettled([1, 2, 3].map(async (n) => economy.purchase(a.accountId, priced.id, `concurrent-${n}`)));
    expect(economy.balance(a.accountId)).toBe(1000 - priced.price);
  });

  it("rejects insufficient balance, unknown items and disabled shop", () => {
    const { economy } = setup();
    const a = player(economy, 10);
    expectCode(() => economy.purchase(a.accountId, priced.id, "k-00000001"), "insufficient_funds");
    expect(economy.owned(a.accountId).has(priced.id)).toBe(false);
    expectCode(() => economy.purchase(a.accountId, "hair.golden-crown", "k-00000002"), "unknown_item");
    expectCode(() => economy.purchase(a.accountId, { id: priced.id, price: 0 }, "k-00000003"), "unknown_item");
    const off = setup({ ...FLAGS, shop: false }).economy;
    const b = player(off, 5000);
    expectCode(() => off.purchase(b.accountId, priced.id, "k-00000004"), "disabled");
  });

  it("equips owned items only; starter items are always owned", () => {
    const { economy } = setup();
    const a = player(economy, 5000);
    const mohawk = { hair: 4, hairColor: 0, face: 0, outfit: 0 };
    expect(economy.saveAppearance(a.accountId, mohawk).hair).toBe(0);
    economy.purchase(a.accountId, "hair.mohawk", "buy-mohawk");
    expect(economy.saveAppearance(a.accountId, mohawk).hair).toBe(4);
    expect(economy.profile(a.accountId).appearance.hair).toBe(4);
    expect(economy.saveAppearance(a.accountId, { hair: 0, hairColor: 0, face: 0, outfit: 0 })).toEqual({ hair: 0, hairColor: 0, face: 0, outfit: 0, avatar: 0 });
    expect(economy.saveAppearance(a.accountId, { hair: 1, hairColor: 1, face: 1, outfit: 1 })).toEqual({ hair: 1, hairColor: 1, face: 1, outfit: 1, avatar: 0 });
    expect(economy.saveAppearance(a.accountId, { hair: 2, hairColor: 3, face: 2, outfit: 2 })).toEqual({ hair: 0, hairColor: 0, face: 0, outfit: 0, avatar: 0 });
  });
});

describe("payments", () => {
  it("are disabled and can never succeed", async () => {
    for (const flags of [FLAGS, { ...FLAGS, premiumCurrency: true, realMoneyPurchases: true }]) {
      const result = await new PaymentService(flags).createCheckout("acc", "gems_100");
      expect(result.ok).toBe(false);
    }
    expect(new PaymentService(FLAGS).available).toBe(false);
  });

  it("every non-starter item has a price and starter items are free", () => {
    for (const item of CATALOG) expect(item.starter ? item.price === 0 : item.price > 0).toBe(true);
    for (const category of ["hair", "hairColor", "face", "outfit"]) {
      expect(CATALOG.filter((i) => i.category === category && i.starter)).toHaveLength(3);
    }
    expect(CATALOG.length).toBeGreaterThanOrEqual(30);
  });

  it("the catalog only sells cosmetics for Sumo Coins", () => {
    expect(CATALOG.every((i) => i.currency === Currency.Coins)).toBe(true);
    expect(ROOKIE.entryFee).toBeGreaterThan(0);
  });
});

describe("levels", () => {
  it("bouts give XP, levels unlock arenas", () => {
    const { economy } = setup();
    const a = player(economy, 5000);
    expect(economy.profile(a.accountId).level.level).toBe(1);
    expect(economy.canEnter(a.accountId, "pro").ok).toBe(false);
    for (let i = 0; i < 40; i++) {
      economy.recordMatch({ matchId: `x${i}`, durationMs: 30_000, rewarded: false, arenaId: "rookie", participants: [{ accountId: a.accountId, won: true, completed: true }] });
    }
    const profile = economy.profile(a.accountId);
    expect(profile.level.level).toBeGreaterThanOrEqual(5);
    // Every level reached paid its reward, once.
    const levelUps = economy.ledger(a.accountId, 200).filter((e) => e.category === "level_up");
    expect(levelUps.reduce((sum, e) => sum + e.amount, 0)).toBe(levelUpCoins(1, profile.level.level));
    expect(economy.canEnter(a.accountId, "pro").ok).toBe(true);
  });
});
