import { createHash, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { EconomyError, type Economy } from "../economy/Economy.js";
import type { Mailer } from "./mailer.js";

/**
 * Saving progress with an email, and getting it back on another device.
 *
 * Link: a signed-in player asks for a code, it's emailed, and entering it links the email to
 * their account (one email per account, one account per email).
 * Restore: on a new device, a code is emailed to a linked address; entering it gives this
 * device its own key to that account (other devices keep theirs).
 *
 * Codes: 6 digits, stored only as hashes, valid for 15 minutes, 5 tries, one email a minute.
 */
const CODE_MINUTES = 15;
const MAX_TRIES = 5;
const RESEND_MS = 60_000;
const MAX_PER_HOUR = 6;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS account_emails (
  account_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  verified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('link', 'restore')),
  account_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);
CREATE TABLE IF NOT EXISTS email_sends (
  email TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_sends_email ON email_sends (email, sent_at);
`;

const hash = (email: string, code: string) => createHash("sha256").update(`${email}:${code}`).digest("hex");

/** Lower-cased and trimmed; null when it isn't an email address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export class AccountRecovery {
  private readonly db: DatabaseSync;

  constructor(
    private readonly economy: Economy,
    private readonly mailer: Mailer | null,
    private readonly publicUrl: string = "https://sumo.ryujin.fans/",
    private readonly now: () => number = Date.now,
  ) {
    this.db = economy.database;
    this.db.exec(SCHEMA);
  }

  get available(): boolean {
    return this.mailer !== null;
  }

  linkedEmail(accountId: string): string | null {
    return (this.db.prepare("SELECT email FROM account_emails WHERE account_id = ?").get(accountId) as { email: string } | undefined)?.email ?? null;
  }

  private accountForEmail(email: string): string | null {
    return (this.db.prepare("SELECT account_id FROM account_emails WHERE email = ?").get(email) as { account_id: string } | undefined)?.account_id ?? null;
  }

  private async sendCode(email: string, purpose: "link" | "restore", accountId: string, lang: "en" | "fa"): Promise<void> {
    if (!this.mailer) throw new EconomyError("store_unavailable", "Saving with email isn't available right now.");
    const now = this.now();
    const last = this.db.prepare("SELECT sent_at FROM email_codes WHERE email = ? AND purpose = ?").get(email, purpose) as { sent_at: number } | undefined;
    if (last && now - last.sent_at < RESEND_MS) throw new EconomyError("bad_request", "A code was just sent. Wait a minute before asking for another.");
    const recent = (this.db.prepare("SELECT COUNT(*) AS n FROM email_sends WHERE email = ? AND sent_at > ?").get(email, now - 3600_000) as { n: number }).n;
    if (recent >= MAX_PER_HOUR) throw new EconomyError("bad_request", "Too many codes for this email. Try again in an hour.");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.db
      .prepare(
        `INSERT INTO email_codes (email, purpose, account_id, code_hash, expires_at, tries, sent_at) VALUES (?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(email, purpose) DO UPDATE SET account_id = excluded.account_id, code_hash = excluded.code_hash,
           expires_at = excluded.expires_at, tries = 0, sent_at = excluded.sent_at`,
      )
      .run(email, purpose, accountId, hash(email, code), now + CODE_MINUTES * 60_000, now);
    this.db.prepare("INSERT INTO email_sends (email, sent_at) VALUES (?, ?)").run(email, now);
    const link = new URL(this.publicUrl);
    link.searchParams.set("code", code);
    link.searchParams.set("email", email);
    link.searchParams.set("purpose", purpose);
    const name = this.economy.publicAccount(accountId)?.name || "Wrestler";
    await this.mailer.send({ to: email, name, code, link: link.toString(), purpose, lang, minutes: CODE_MINUTES });
  }

  /** Checks a code (once); throws a friendly error when it's wrong, used up or expired. */
  private takeCode(email: string, purpose: "link" | "restore", rawCode: unknown): string {
    const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
    const row = this.db.prepare("SELECT * FROM email_codes WHERE email = ? AND purpose = ?").get(email, purpose) as
      | { account_id: string; code_hash: string; expires_at: number; tries: number }
      | undefined;
    if (!row || row.expires_at < this.now()) throw new EconomyError("bad_request", "This code has expired. Ask for a new one.");
    if (row.tries >= MAX_TRIES) throw new EconomyError("bad_request", "Too many wrong tries. Ask for a new code.");
    if (code.length !== 6 || hash(email, code) !== row.code_hash) {
      this.db.prepare("UPDATE email_codes SET tries = tries + 1 WHERE email = ? AND purpose = ?").run(email, purpose);
      throw new EconomyError("bad_request", "That code isn't right. Check the email and try again.");
    }
    this.db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").run(email, purpose);
    return row.account_id;
  }

  // ------------------------------------------------------------ link (signed in)

  async startLink(accountId: string, rawEmail: unknown, lang: "en" | "fa"): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new EconomyError("bad_request", "That doesn't look like an email address.");
    const owner = this.accountForEmail(email);
    if (owner === accountId) throw new EconomyError("bad_request", "Your progress is already saved with this email.");
    if (owner) throw new EconomyError("bad_request", "This email already saves another player's progress. To play as that player here, use Restore.");
    await this.sendCode(email, "link", accountId, lang);
  }

  verifyLink(accountId: string, rawEmail: unknown, code: unknown): { email: string } {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new EconomyError("bad_request", "That doesn't look like an email address.");
    const forAccount = this.takeCode(email, "link", code);
    if (forAccount !== accountId) throw new EconomyError("bad_request", "This code was for another player.");
    if (this.accountForEmail(email)) throw new EconomyError("bad_request", "This email already saves another player's progress.");
    this.db
      .prepare(
        `INSERT INTO account_emails (account_id, email, verified_at) VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET email = excluded.email, verified_at = excluded.verified_at`,
      )
      .run(accountId, email, new Date(this.now()).toISOString());
    return { email };
  }

  // ------------------------------------------------------------ restore (new device)

  /** Sends a code if the email saves a player; says nothing either way (no account probing). */
  async startRestore(rawEmail: unknown, lang: "en" | "fa"): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new EconomyError("bad_request", "That doesn't look like an email address.");
    const accountId = this.accountForEmail(email);
    if (!accountId) return;
    await this.sendCode(email, "restore", accountId, lang);
  }

  verifyRestore(rawEmail: unknown, code: unknown): { accountId: string; token: string } {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new EconomyError("bad_request", "That doesn't look like an email address.");
    const accountId = this.takeCode(email, "restore", code);
    return { accountId, token: this.economy.issueDeviceToken(accountId) };
  }
}
