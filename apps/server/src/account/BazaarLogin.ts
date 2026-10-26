import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { EconomyError, type Economy } from "../economy/Economy.js";

/**
 * Sign in with Cafe Bazaar on the web (OAuth2:
 * https://developers.cafebazaar.ir/fa/guidelines/feature/bazaar-login/web).
 *
 * 1. The signed-in player asks to start: the server remembers them under a random `state`
 *    and sends back Bazaar's sign-in address.
 * 2. Bazaar sends the browser to our callback with a code; the server swaps it for a token,
 *    asks Bazaar who it is (account_id) and:
 *    - a Bazaar account not linked yet: links it to this player ("linked");
 *    - linked to this player already: nothing to do ("linked");
 *    - linked to another player: this device signs in as that player ("restore").
 * 3. The browser comes back to the game with a one-time ticket (never the player's key in the
 *    address); the game claims it to learn the outcome (and, for "restore", that player's key).
 *
 * The Bazaar account id comes from Bazaar's server, so it can't be faked by the game.
 */
const STATE_MINUTES = 10;
const TICKET_MINUTES = 5;
const AUTHORIZE_URL = "https://cafebazaar.ir/user/oauth";
const TOKEN_URL = "https://account.cafebazaar.ir/api/v0/tokens";
const USERINFO_URL = "https://account.cafebazaar.ir/api/v0/userinfo";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS account_bazaar (
  account_id TEXT PRIMARY KEY,
  bazaar_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bazaar_login_states (
  state TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bazaar_login_tickets (
  ticket_hash TEXT PRIMARY KEY,
  outcome TEXT NOT NULL,
  account_id TEXT NOT NULL,
  token TEXT,
  expires_at INTEGER NOT NULL
);
`;

export interface BazaarLoginConfig {
  clientId: string;
  secret: string;
  /** The server's public address (Bazaar sends players back to <publicUrl>api/account/bazaar/callback). */
  publicUrl: string;
  /** Pages the player may come back to (origins), e.g. the web game and GitHub Pages. */
  returnOrigins: string[];
}

export type BazaarLoginOutcome = "linked" | "restore" | "cancelled" | "failed";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

export class BazaarLogin {
  private readonly db: DatabaseSync;

  constructor(
    private readonly economy: Economy,
    private readonly config: BazaarLoginConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.db = economy.database;
    this.db.exec(SCHEMA);
  }

  /** Bazaar sends players back here; register it in the panel ("ورود با بازار"). */
  get callbackUrl(): string {
    return new URL("api/account/bazaar/callback", this.config.publicUrl).toString();
  }

  linked(accountId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM account_bazaar WHERE account_id = ?").get(accountId));
  }

  private ownerOf(bazaarId: string): string | null {
    return (this.db.prepare("SELECT account_id FROM account_bazaar WHERE bazaar_id = ?").get(bazaarId) as { account_id: string } | undefined)?.account_id ?? null;
  }

  /** Only pages of the game may receive the ticket (no open redirect). */
  private checkReturnUrl(raw: unknown): string {
    let url: URL;
    try {
      url = new URL(String(raw));
    } catch {
      throw new EconomyError("bad_request", "Unknown return address.");
    }
    if (!this.config.returnOrigins.includes(url.origin)) throw new EconomyError("bad_request", "Unknown return address.");
    url.hash = "";
    return url.toString();
  }

  /** Step 1: Bazaar's sign-in address for this player. */
  start(accountId: string, returnUrl: unknown): { url: string } {
    const back = this.checkReturnUrl(returnUrl);
    const now = this.now();
    this.db.prepare("DELETE FROM bazaar_login_states WHERE expires_at < ?").run(now);
    const state = randomBytes(24).toString("hex");
    this.db
      .prepare("INSERT INTO bazaar_login_states (state, account_id, return_url, expires_at) VALUES (?, ?, ?, ?)")
      .run(state, accountId, back, now + STATE_MINUTES * 60_000);
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("redirect_url", this.callbackUrl);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  }

  /** The Bazaar account id behind an authorization code. */
  private async bazaarAccount(code: string): Promise<string> {
    const tokenRes = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: this.config.clientId, client_secret: this.config.secret }).toString(),
    });
    const tokens = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; token_type?: string };
    if (!tokenRes.ok || !tokens.access_token) throw new Error(`token exchange failed (${tokenRes.status})`);
    const infoRes = await this.fetchImpl(USERINFO_URL, { headers: { Authorization: `${tokens.token_type || "Bearer"} ${tokens.access_token}` } });
    const info = (await infoRes.json().catch(() => ({}))) as { account_id?: unknown; error?: string };
    if (!infoRes.ok || typeof info.account_id !== "string" || !info.account_id) throw new Error(`userinfo failed (${infoRes.status} ${info.error ?? ""})`);
    return info.account_id;
  }

  private ticket(outcome: BazaarLoginOutcome, accountId: string, token: string | null): string {
    const ticket = randomBytes(24).toString("hex");
    const now = this.now();
    this.db.prepare("DELETE FROM bazaar_login_tickets WHERE expires_at < ?").run(now);
    this.db
      .prepare("INSERT INTO bazaar_login_tickets (ticket_hash, outcome, account_id, token, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(sha(ticket), outcome, accountId, token, now + TICKET_MINUTES * 60_000);
    return ticket;
  }

  /**
   * Step 2: Bazaar's answer. Returns where to send the browser: the game, with ?bazaarLogin=<ticket>
   * (or ?bazaarLogin=cancelled / failed). An unknown or expired state goes to the server's home.
   */
  async callback(params: URLSearchParams): Promise<string> {
    const state = params.get("state") ?? "";
    const row = this.db.prepare("SELECT account_id, return_url, expires_at FROM bazaar_login_states WHERE state = ?").get(state) as
      | { account_id: string; return_url: string; expires_at: number }
      | undefined;
    if (!row || row.expires_at < this.now()) return this.config.publicUrl;
    this.db.prepare("DELETE FROM bazaar_login_states WHERE state = ?").run(state);
    const back = new URL(row.return_url);
    const code = params.get("code");
    if (params.get("error") || !code) {
      back.searchParams.set("bazaarLogin", "cancelled");
      return back.toString();
    }
    try {
      const bazaarId = await this.bazaarAccount(code);
      const owner = this.ownerOf(bazaarId);
      let ticket: string;
      if (owner && owner !== row.account_id) {
        // This Bazaar account saves another player: sign this device in as them.
        ticket = this.ticket("restore", owner, this.economy.issueDeviceToken(owner));
      } else {
        if (!owner) {
          this.db
            .prepare(
              `INSERT INTO account_bazaar (account_id, bazaar_id, linked_at) VALUES (?, ?, ?)
               ON CONFLICT(account_id) DO UPDATE SET bazaar_id = excluded.bazaar_id, linked_at = excluded.linked_at`,
            )
            .run(row.account_id, bazaarId, new Date(this.now()).toISOString());
        }
        ticket = this.ticket("linked", row.account_id, null);
      }
      back.searchParams.set("bazaarLogin", ticket);
    } catch (error) {
      console.warn("[bazaar-login]", error instanceof Error ? error.message : error);
      back.searchParams.set("bazaarLogin", "failed");
    }
    return back.toString();
  }

  /** Step 3: the outcome behind a ticket, once. "restore" includes that player's id and key. */
  claim(rawTicket: unknown): { outcome: "linked" | "restore"; accountId: string; token?: string } {
    const ticket = typeof rawTicket === "string" ? rawTicket : "";
    const row = this.db.prepare("SELECT outcome, account_id, token, expires_at FROM bazaar_login_tickets WHERE ticket_hash = ?").get(sha(ticket)) as
      | { outcome: "linked" | "restore"; account_id: string; token: string | null; expires_at: number }
      | undefined;
    this.db.prepare("DELETE FROM bazaar_login_tickets WHERE ticket_hash = ?").run(sha(ticket));
    if (!row || row.expires_at < this.now()) throw new EconomyError("bad_request", "This sign-in has expired. Sign in with Bazaar again.");
    return row.outcome === "restore" && row.token
      ? { outcome: "restore", accountId: row.account_id, token: row.token }
      : { outcome: "linked", accountId: row.account_id };
  }
}
