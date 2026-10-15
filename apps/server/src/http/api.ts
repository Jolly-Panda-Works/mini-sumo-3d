import type { IncomingMessage, ServerResponse } from "node:http";
import type { CatalogResponse, LedgerResponse, ProfileResponse } from "@mini-sumo/shared";
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
const writeLimiter = new Limiter(60, 60 * 1000);

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
};

export function createApiHandler(economy: Economy | null, payments: PaymentService) {
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

    if (route === "GET /api/catalog") {
      const body: CatalogResponse = {
        flags: economy?.flags ?? { economy: false, shop: false, premiumCurrency: false, realMoneyPurchases: false },
        arenas: listArenas(),
        items: CATALOG.map((item) => ({ ...item })),
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

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const accountId = economy.authenticate(token);
    if (!accountId) {
      send(res, 401, { error: "unauthorized", message: "Unknown or missing player token." });
      return true;
    }

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
