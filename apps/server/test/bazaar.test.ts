import { describe, expect, it } from "vitest";
import { BazaarVerifier, bazaarConfigFromEnv } from "../src/economy/bazaar.js";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };
const CONFIG = { clientId: "cid", clientSecret: "secret", refreshToken: "refresh", packageName: "com.jollypanda.mini_sumo" };

/** A fake Cafe Bazaar: purchases by token, and a count of token refreshes. */
function fakeBazaar(purchases: Record<string, { purchaseState: number; consumptionState: number }>) {
  const calls = { token: 0, validate: 0 };
  const reply = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    if (url.endsWith("/auth/token/")) {
      calls.token++;
      const form = new URLSearchParams(init?.body ?? "");
      if (form.get("refresh_token") !== "refresh") return reply(400, { error: "invalid_grant" });
      return reply(200, { access_token: `access-${calls.token}`, expires_in: 3600 });
    }
    calls.validate++;
    if (!init?.headers?.Authorization?.startsWith("Bearer access-")) return reply(401, { error: "invalid_token" });
    const token = decodeURIComponent(url.split("/purchases/")[1]!.replace(/\/$/, ""));
    const p = purchases[token];
    return p ? reply(200, { kind: "androidpublisher#inappPurchase", ...p }) : reply(404, { error: "not_found" });
  };
  return { fetchImpl, calls };
}

describe("Cafe Bazaar purchase verification", () => {
  it("confirms a bought, unconsumed purchase and refuses the rest", async () => {
    const { fetchImpl } = fakeBazaar({
      good: { purchaseState: 0, consumptionState: 1 },
      used: { purchaseState: 0, consumptionState: 0 },
      refunded: { purchaseState: 1, consumptionState: 1 },
    });
    const v = new BazaarVerifier(CONFIG, fetchImpl);
    expect(await v.check("coin-lucky", "good")).toEqual({ ok: true });
    expect(await v.check("coin-lucky", "used")).toMatchObject({ ok: false, reason: "consumed" });
    expect(await v.check("coin-lucky", "refunded")).toMatchObject({ ok: false, reason: "not_purchased" });
    expect(await v.check("coin-lucky", "made-up")).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("keeps the access token until it nearly runs out, then refreshes it", async () => {
    let now = 1_000_000;
    const { fetchImpl, calls } = fakeBazaar({ good: { purchaseState: 0, consumptionState: 1 } });
    const v = new BazaarVerifier(CONFIG, fetchImpl, () => now);
    await v.check("coin-lucky", "good");
    await v.check("coin-lucky", "good");
    expect(calls.token).toBe(1);
    now += 3600_000;
    await v.check("coin-lucky", "good");
    expect(calls.token).toBe(2);
  });

  it("reports Cafe Bazaar being unreachable instead of refusing the purchase", async () => {
    const v = new BazaarVerifier(CONFIG, async () => {
      throw new Error("network down");
    });
    expect(await v.check("coin-lucky", "good")).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("is off without its keys", () => {
    expect(bazaarConfigFromEnv({})).toBe(null);
    expect(bazaarConfigFromEnv({ BAZAAR_CLIENT_ID: "a", BAZAAR_CLIENT_SECRET: "b", BAZAAR_REFRESH_TOKEN: "c" })?.packageName).toBe(
      "com.jollypanda.mini_sumo",
    );
  });

  it("credits a purchase once per token, whichever account sends it", () => {
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date("2026-10-19T10:00:00Z"), false);
    const { accountId: a } = economy.createGuest();
    const { accountId: b } = economy.createGuest();
    const before = economy.balance(a);
    expect(economy.creditStorePurchase(a, "bazaar", "tok1", 1200, "Coin stack").credited).toBe(true);
    expect(economy.balance(a)).toBe(before + 1200);
    expect(economy.creditStorePurchase(a, "bazaar", "tok1", 1200, "Coin stack").credited).toBe(false);
    expect(economy.creditStorePurchase(b, "bazaar", "tok1", 1200, "Coin stack").credited).toBe(false);
    expect(economy.balance(a)).toBe(before + 1200);
    expect(economy.creditedStorePurchase("bazaar", "tok1")).toBe(true);
    expect(economy.creditedStorePurchase("bazaar", "tok2")).toBe(false);
  });
});

describe("Cafe Bazaar purchase verification with the Pishkhan API token", () => {
  /** A fake Cafe Bazaar that only accepts the app's token in its header. */
  function fakeWithSecret(purchases: Record<string, { purchaseState: number; consumptionState: number }>) {
    const seen: string[] = [];
    const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }) => {
      seen.push(url);
      if (init?.headers?.["CAFEBAZAAR-PISHKHAN-API-SECRET"] !== "app-token") return reply(401, { error: "invalid_token" });
      const token = decodeURIComponent(url.split("/purchases/")[1]!.replace(/\/$/, ""));
      const p = purchases[token];
      return p ? reply(200, p) : reply(404, { error: "not_found" });
    };
    return { fetchImpl, seen };
  }

  it("checks purchases with the token in its header, no OAuth", async () => {
    const { fetchImpl, seen } = fakeWithSecret({ good: { purchaseState: 0, consumptionState: 1 }, used: { purchaseState: 0, consumptionState: 0 } });
    const v = new BazaarVerifier({ apiSecret: "app-token", packageName: "com.jollypanda.mini_sumo" }, fetchImpl);
    expect(await v.check("coins_500", "good")).toEqual({ ok: true });
    expect(await v.check("coins_500", "used")).toMatchObject({ ok: false, reason: "consumed" });
    expect(await v.check("coins_500", "made-up")).toMatchObject({ ok: false, reason: "not_found" });
    expect(seen.every((u) => u.includes("/api/validate/com.jollypanda.mini_sumo/inapp/coins_500/purchases/"))).toBe(true);
    expect(seen.some((u) => u.includes("/auth/token/"))).toBe(false);
  });

  it("a wrong token is Cafe Bazaar being unavailable, not a refused purchase", async () => {
    const { fetchImpl } = fakeWithSecret({ good: { purchaseState: 0, consumptionState: 1 } });
    const v = new BazaarVerifier({ apiSecret: "wrong", packageName: "com.jollypanda.mini_sumo" }, fetchImpl);
    expect(await v.check("coins_500", "good")).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("says at startup whether Cafe Bazaar accepts the token", async () => {
    const { fetchImpl } = fakeWithSecret({});
    const pkg = "com.jollypanda.mini_sumo";
    expect(await new BazaarVerifier({ apiSecret: "app-token", packageName: pkg }, fetchImpl).selfCheck()).toBe("ok");
    expect(await new BazaarVerifier({ apiSecret: "wrong", packageName: pkg }, fetchImpl).selfCheck()).toBe("refused");
    const offline = async () => {
      throw new Error("getaddrinfo ENOTFOUND pardakht.cafebazaar.ir");
    };
    expect(await new BazaarVerifier({ apiSecret: "app-token", packageName: pkg }, offline).selfCheck()).toBe("unreachable");
  });

  it("uses the token when it's set, the OAuth client otherwise", () => {
    expect(bazaarConfigFromEnv({ BAZAAR_PISHKHAN_TOKEN: " t ", BAZAAR_CLIENT_ID: "c", BAZAAR_CLIENT_SECRET: "s", BAZAAR_REFRESH_TOKEN: "r" })).toEqual({
      apiSecret: "t",
      packageName: "com.jollypanda.mini_sumo",
    });
    expect(bazaarConfigFromEnv({ BAZAAR_CLIENT_ID: "c", BAZAAR_CLIENT_SECRET: "s", BAZAAR_REFRESH_TOKEN: "r" })).toMatchObject({ clientId: "c" });
    expect(bazaarConfigFromEnv({})).toBeNull();
  });
});
