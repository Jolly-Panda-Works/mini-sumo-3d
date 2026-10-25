import type { IncomingMessage, ServerResponse } from "node:http";
import { packForBazaarProduct } from "@mini-sumo/shared";
import type {
  BazaarPurchaseRequest,
  BazaarPurchaseResponse,
  CatalogResponse,
  FriendProfile,
  FriendsResponse,
  GameInvite,
  LeaderboardResponse,
  LedgerResponse,
  ProfileResponse,
} from "@mini-sumo/shared";
import { Friends } from "../social/Friends.js";
import type { BazaarVerifier } from "../economy/bazaar.js";
import type { AccountRecovery } from "../account/Recovery.js";
import { versionInfo } from "./version.js";
import { CATALOG, listArenas } from "../economy/config.js";
import { EconomyError, type Economy } from "../economy/Economy.js";
import type { PaymentService } from "../economy/payments.js";

/**
 * Small JSON API next to Colyseus (same port):
 *   GET  /api/catalog            public arenas, shop items and feature flags
 *   POST /api/guest              create a device-bound guest account -> { accountId, token }
 *   GET  /api/profile            balances, owned items, stats            (Bearer token)
 *   GET  /api/ledger?limit=50    transaction history                     (Bearer token)
 *   POST /api/shop/purchase      { itemId, idempotencyKey }              (Bearer token)
 *   PUT  /api/profile/appearance { hair, hairColor, face, outfit }       (Bearer token)
 *   POST /api/profile/sync { name, appearance, xp, matches, wins, updatedAt } (Bearer token)
 *   GET  /api/account/email                 the email saving your progress   (Bearer token)
 *   POST /api/account/email/start { email, lang }   sign in: email a code -> { purpose: link | restore } (Bearer token)
 *   POST /api/account/logout                this device signs out (its key stops working) (Bearer token)
 *   POST /api/account/email/verify { email, code }  save your progress with it   (Bearer token)
 *   POST /api/account/restore/start { email, lang } email a code to restore      (no token)
 *   POST /api/account/restore/verify { email, code } -> { accountId, token }     (no token)
 *   POST /api/purchases/bazaar { productId, purchaseToken }  a Cafe Bazaar coin pack (Bearer token)
 *   POST /api/daily-gift                    the free daily coins (once a day) (Bearer token)
 *   GET  /api/version                       latest app version, minimum to play (no token)
 *   GET  /api/leaderboard?limit=100         top players by XP + your rank    (Bearer token)
 *   GET  /api/friends                       your code, friends, requests     (Bearer token)
 *   GET  /api/friends/profile?id=…          a friend's profile               (Bearer token)
 *   GET  /api/players/profile?id=…          anyone's public profile (leaderboard) (Bearer token)
 *   POST /api/friends/request { code } | { accountId }  add by code, or someone from a bout (Bearer token)
 *   POST /api/friends/respond { accountId, accept }                          (Bearer token)
 *   POST /api/friends/remove { accountId }  remove / cancel                  (Bearer token)
 *   GET  /api/invites                       game invites for you             (Bearer token)
 *   POST /api/invites { accountId, roomId } invite an online friend          (Bearer token)
 *   POST /api/invites/dismiss { id }                                         (Bearer token)
 *   POST /api/payments/checkout  always refused (no provider)            (Bearer token)
 */

const MAX_BODY = 4096;

class Limiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.hits.clear();
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }
}

const guestLimiter = new Limiter(10, 60 * 60 * 1000);
/** The same error answer as the main handler (friendly message, or a generic 500). */
function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof EconomyError) send(res, STATUS[error.code], { error: error.code, message: error.message });
  else {
    console.error("[mini-sumo] api error", error);
    send(res, 500, { error: "internal", message: "Something went wrong." });
  }
}

const writeLimiter = new Limiter(60, 60 * 1000);
/** Read once at startup (it only changes with a new server build). */
const gameVersion = versionInfo();
const restoreLimiter = new Limiter(20, 60 * 60 * 1000);

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

const STATUS: Record<EconomyError["code"], number> = {
  disabled: 403,
  unknown_account: 401,
  insufficient_funds: 409,
  invalid_amount: 400,
  unknown_item: 404,
  item_unavailable: 409,
  unknown_arena: 404,
  arena_locked: 403,
  already_entered: 409,
  currency_disabled: 403,
  unknown_friend: 404,
  store_unavailable: 503,
  purchase_invalid: 402,
  not_friends: 403,
  friend_offline: 409,
  bad_request: 400,
};

export function createApiHandler(
  economy: Economy | null,
  payments: PaymentService,
  friends: Friends | null = economy ? new Friends(economy) : null,
  /** Cafe Bazaar purchase verification; null when its keys aren't set. */
  bazaar: BazaarVerifier | null = null,
  /** Saving progress with an email; null when there's no database. */
  recovery: AccountRecovery | null = null,
) {
  return async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return true;
    }

    const route = `${req.method} ${url.pathname}`;
    const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "?").trim();

    // Update check (no token): the latest version and the oldest one that may still play.
    if (route === "GET /api/version") {
      send(res, 200, gameVersion);
      return true;
    }

    if (route === "GET /api/catalog") {
      const body: CatalogResponse = {
        flags: economy?.flags ?? { economy: false, shop: false, premiumCurrency: false, realMoneyPurchases: false },
        arenas: listArenas(),
        items: CATALOG.map((item) => ({ ...item })),
        stores: { bazaar: Boolean(economy && bazaar) },
        emailRecovery: Boolean(economy && recovery?.available),
      };
      send(res, 200, body);
      return true;
    }

    if (!economy) {
      send(res, 503, { error: "disabled", message: "The economy is not enabled on this server." });
      return true;
    }

    if (route === "POST /api/guest") {
      if (!guestLimiter.allow(ip)) {
        send(res, 429, { error: "rate_limited", message: "Too many new accounts from this address. Try again later." });
        return true;
      }
      send(res, 201, economy.createGuest());
      return true;
    }

    // Restoring progress on a new device: not signed in yet. Per-address limit on top of the
    // per-email limits in AccountRecovery.
    if (route === "POST /api/account/restore/start" || route === "POST /api/account/restore/verify") {
      if (!recovery) {
        send(res, 503, { error: "store_unavailable", message: "Restoring progress isn't available right now." });
        return true;
      }
      if (!restoreLimiter.allow(ip)) {
        send(res, 429, { error: "rate_limited", message: "Too many tries from this address. Try again later." });
        return true;
      }
      try {
        const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
        if (route === "POST /api/account/restore/start") {
          await recovery.startRestore(body.email, body.lang === "fa" ? "fa" : "en");
          send(res, 200, { ok: true });
        } else {
          send(res, 200, recovery.verifyRestore(body.email, body.code));
        }
      } catch (error) {
        sendError(res, error);
      }
      return true;
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const accountId = economy.authenticate(token);
    if (!accountId) {
      send(res, 401, { error: "unauthorized", message: "Unknown or missing player token." });
      return true;
    }
    // Any call from the open game counts as being online (for friends).
    friends?.touch(accountId);

    try {
      if (route === "GET /api/profile") {
        const body: ProfileResponse = economy.profile(accountId);
        send(res, 200, body);
      } else if (route === "GET /api/ledger") {
        const body: LedgerResponse = { entries: economy.ledger(accountId, Number(url.searchParams.get("limit") ?? 50)) };
        send(res, 200, body);
      } else if (route === "POST /api/shop/purchase") {
        if (!writeLimiter.allow(accountId)) {
          send(res, 429, { error: "rate_limited", message: "Slow down a little." });
        } else {
          const body = (await readJson(req)) as Record<string, unknown> | null;
          if (!body) send(res, 400, { error: "bad_request", message: "Invalid request." });
          else send(res, 200, { ...economy.purchase(accountId, body.itemId, body.idempotencyKey), profile: economy.profile(accountId) });
        }
      } else if (route === "PUT /api/profile/appearance") {
        const body = await readJson(req);
        if (!body) send(res, 400, { error: "bad_request", message: "Invalid request." });
        else send(res, 200, { appearance: economy.saveAppearance(accountId, body) });
      } else if (recovery && route === "GET /api/account/email") {
        send(res, 200, { email: recovery.linkedEmail(accountId), available: recovery.available });
      } else if (recovery && route === "POST /api/account/email/start") {
        // Sign in with an email: saves this player with it, or (an email that already saves a
        // player) sends the code that signs this device in as that player.
        if (!writeLimiter.allow(accountId)) {
          send(res, 429, { error: "rate_limited", message: "Slow down a little." });
        } else {
          const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
          const purpose = await recovery.startSignIn(accountId, body.email, body.lang === "fa" ? "fa" : "en");
          send(res, 200, { ok: true, purpose });
        }
      } else if (route === "POST /api/account/logout") {
        // This device signs out: its key stops working.
        economy.revokeToken(token!);
        send(res, 200, { ok: true });
      } else if (recovery && route === "POST /api/account/email/verify") {
        const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
        send(res, 200, recovery.verifyLink(accountId, body.email, body.code));
      } else if (route === "POST /api/purchases/bazaar") {
        // A coin pack bought in Cafe Bazaar: verified with Bazaar, then credited once per token.
        if (!bazaar) throw new EconomyError("store_unavailable", "Buying coins isn't available right now.");
        if (!writeLimiter.allow(accountId)) {
          send(res, 429, { error: "rate_limited", message: "Slow down a little." });
        } else {
          const body = ((await readJson(req)) ?? {}) as Partial<BazaarPurchaseRequest>;
          const productId = typeof body.productId === "string" ? body.productId : "";
          const purchaseToken = typeof body.purchaseToken === "string" ? body.purchaseToken.trim() : "";
          const pack = packForBazaarProduct(productId);
          if (!pack || !purchaseToken || purchaseToken.length > 512) throw new EconomyError("bad_request", "Unknown purchase.");
          const already = economy.creditedStorePurchase("bazaar", purchaseToken);
          if (!already) {
            const check = await bazaar.check(productId, purchaseToken);
            if (!check.ok) {
              if (check.reason === "unavailable") {
                console.error("[bazaar] check failed:", check.detail);
                throw new EconomyError("store_unavailable", "Couldn't reach Cafe Bazaar. Your purchase is kept and will be added later.");
              }
              throw new EconomyError("purchase_invalid", "Cafe Bazaar didn't confirm this purchase.");
            }
          }
          const result = economy.creditStorePurchase(accountId, "bazaar", purchaseToken, pack.coins, pack.name);
          const out: BazaarPurchaseResponse = { credited: result.credited, coins: pack.coins, balance: result.balance };
          send(res, 200, out);
        }
      } else if (route === "POST /api/daily-gift") {
        send(res, 200, economy.claimDailyGift(accountId));
      } else if (route === "GET /api/leaderboard") {
        const body: LeaderboardResponse = economy.leaderboard(accountId, Number(url.searchParams.get("limit") ?? 100));
        send(res, 200, body);
      } else if (friends && route === "GET /api/friends") {
        const body: FriendsResponse = friends.list(accountId);
        send(res, 200, body);
      } else if (friends && route === "GET /api/players/profile") {
        const body: FriendProfile = friends.publicProfile(accountId, url.searchParams.get("id"));
        send(res, 200, body);
      } else if (friends && route === "GET /api/friends/profile") {
        const body: FriendProfile = friends.profile(accountId, url.searchParams.get("id"));
        send(res, 200, body);
      } else if (friends && route.startsWith("POST /api/friends/")) {
        if (!writeLimiter.allow(accountId)) {
          send(res, 429, { error: "rate_limited", message: "Slow down a little." });
        } else {
          const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
          const action = url.pathname.slice("/api/friends/".length);
          if (action === "request") {
            send(res, 200, typeof body.accountId === "string" ? friends.requestById(accountId, body.accountId) : friends.request(accountId, body.code));
          }
          else if (action === "respond") send(res, 200, friends.respond(accountId, body.accountId, body.accept));
          else if (action === "remove") send(res, 200, friends.remove(accountId, body.accountId));
          else send(res, 404, { error: "not_found", message: "Unknown endpoint." });
        }
      } else if (friends && route === "GET /api/invites") {
        const body: { invites: GameInvite[] } = { invites: friends.pendingInvites(accountId) };
        send(res, 200, body);
      } else if (friends && route === "POST /api/invites") {
        if (!writeLimiter.allow(accountId)) {
          send(res, 429, { error: "rate_limited", message: "Slow down a little." });
        } else {
          const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
          send(res, 200, friends.invite(accountId, body.accountId, body.roomId));
        }
      } else if (friends && route === "POST /api/invites/dismiss") {
        const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
        friends.dismissInvite(accountId, body.id);
        send(res, 200, { ok: true });
      } else if (route === "POST /api/profile/sync") {
        if (!writeLimiter.allow(accountId)) {
          send(res, 429, { error: "rate_limited", message: "Slow down a little." });
        } else {
          const body = await readJson(req);
          if (!body) send(res, 400, { error: "bad_request", message: "Invalid request." });
          else send(res, 200, economy.syncProfile(accountId, body));
        }
      } else if (route === "POST /api/payments/checkout") {
        const body = (await readJson(req)) as Record<string, unknown> | null;
        const result = await payments.createCheckout(accountId, body?.productId);
        send(res, 501, result);
      } else {
        send(res, 404, { error: "not_found", message: "Unknown endpoint." });
      }
    } catch (error) {
      if (error instanceof EconomyError) send(res, STATUS[error.code], { error: error.code, message: error.message });
      else {
        console.error("[mini-sumo] api error", error);
        send(res, 500, { error: "internal", message: "Something went wrong." });
      }
    }
    return true;
  };
}
