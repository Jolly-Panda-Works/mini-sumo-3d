import { describe, expect, it } from "vitest";
import { BazaarLogin } from "../src/account/BazaarLogin.js";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };
const GAME = "https://sumo.ryujin.fans/";

/** The error message of a failing call ("" when it succeeds). */
function thrown(fn: () => unknown): string {
  try {
    fn();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** A Bazaar that knows one auth code per Bazaar account ("code-<id>"). */
function setup() {
  let now = Date.parse("2026-10-26T10:00:00Z");
  const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date(now), false);
  const calls: string[] = [];
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/tokens")) {
      const body = new URLSearchParams(String(init?.body));
      const code = body.get("code") ?? "";
      if (!code.startsWith("code-") || body.get("client_secret") !== "s3cret") return new Response("{}", { status: 400 });
      return Response.json({ access_token: `at-${code.slice(5)}`, token_type: "Bearer", expires_in: 3600, refresh_token: "rt" });
    }
    if (url.endsWith("/userinfo")) {
      const auth = new Headers(init?.headers).get("Authorization") ?? "";
      return Response.json({ account_id: `bazaar-${auth.replace("Bearer at-", "")}` });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const login = new BazaarLogin(
    economy,
    { clientId: "client", secret: "s3cret", publicUrl: GAME, returnOrigins: ["https://sumo.ryujin.fans", "https://jolly-panda-works.github.io"] },
    fakeFetch,
    () => now,
  );
  return { economy, login, calls, advance: (ms: number) => (now += ms) };
}

/** Starts a sign-in and comes back from Bazaar with `code`; returns the game address Bazaar sends to. */
async function signIn(login: BazaarLogin, accountId: string, code: string | null, returnUrl = `${GAME}?x=1`): Promise<URL> {
  const { url } = login.start(accountId, returnUrl);
  const state = new URL(url).searchParams.get("state")!;
  const params = new URLSearchParams({ state });
  if (code) params.set("code", code);
  else params.set("error", "access_denied");
  return new URL(await login.callback(params));
}

describe("sign in with Bazaar (web)", () => {
  it("sends the player to Bazaar with our callback and a state", () => {
    const { economy, login } = setup();
    const { accountId } = economy.createGuest();
    const url = new URL(login.start(accountId, `${GAME}`).url);
    expect(url.origin + url.pathname).toBe("https://cafebazaar.ir/user/oauth");
    expect(url.searchParams.get("client_id")).toBe("client");
    expect(url.searchParams.get("redirect_url")).toBe("https://sumo.ryujin.fans/api/account/bazaar/callback");
    expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{48}$/);
  });

  it("only comes back to the game's own pages", () => {
    const { economy, login } = setup();
    const { accountId } = economy.createGuest();
    expect(thrown(() => login.start(accountId, "https://evil.example/steal"))).toMatch(/return address/);
    expect(thrown(() => login.start(accountId, "https://jolly-panda-works.github.io/mini-sumo-3d/"))).toBe("");
  });

  it("links a new Bazaar account to the player, once per ticket", async () => {
    const { economy, login } = setup();
    const { accountId } = economy.createGuest();
    const back = await signIn(login, accountId, "code-111");
    expect(back.origin + back.pathname).toBe("https://sumo.ryujin.fans/");
    expect(back.searchParams.get("x")).toBe("1");
    const ticket = back.searchParams.get("bazaarLogin")!;
    expect(login.claim(ticket)).toEqual({ outcome: "linked", accountId });
    expect(login.linked(accountId)).toBe(true);
    expect(thrown(() => login.claim(ticket))).toMatch(/expired/);
  });

  it("signs a new device in as the player that Bazaar account saves", async () => {
    const { economy, login } = setup();
    const first = economy.createGuest();
    await signIn(login, first.accountId, "code-222").then((b) => login.claim(b.searchParams.get("bazaarLogin")));
    const second = economy.createGuest();
    const back = await signIn(login, second.accountId, "code-222");
    const result = login.claim(back.searchParams.get("bazaarLogin"));
    expect(result.outcome).toBe("restore");
    expect(result.accountId).toBe(first.accountId);
    // A key of its own for this device, which signs in as the first player.
    expect(economy.authenticate(result.token)).toBe(first.accountId);
    expect(login.linked(second.accountId)).toBe(false);
  });

  it("reports a cancelled or failed sign-in, and ignores unknown or old states", async () => {
    const { economy, login, advance } = setup();
    const { accountId } = economy.createGuest();
    expect((await signIn(login, accountId, null)).searchParams.get("bazaarLogin")).toBe("cancelled");
    expect((await signIn(login, accountId, "bad-code")).searchParams.get("bazaarLogin")).toBe("failed");
    expect(await login.callback(new URLSearchParams({ state: "nope", code: "code-1" }))).toBe(GAME);
    const { url } = login.start(accountId, GAME);
    advance(11 * 60_000);
    const state = new URL(url).searchParams.get("state")!;
    expect(await login.callback(new URLSearchParams({ state, code: "code-1" }))).toBe(GAME);
    expect(login.linked(accountId)).toBe(false);
  });

  it("tickets expire after a few minutes", async () => {
    const { economy, login, advance } = setup();
    const { accountId } = economy.createGuest();
    const ticket = (await signIn(login, accountId, "code-333")).searchParams.get("bazaarLogin");
    advance(6 * 60_000);
    expect(thrown(() => login.claim(ticket))).toMatch(/expired/);
  });
});
