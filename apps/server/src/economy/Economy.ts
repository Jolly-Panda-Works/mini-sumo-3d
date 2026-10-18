import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { APPEARANCE_LIMITS, NAME_MAX_LENGTH,
  Currency,
  STARTER_ITEMS,
  restrictToOwned,
  sanitizeAppearance,
  type Appearance,
  type EconomyFlags,
  type LedgerCategory,
  type LedgerEntry,
  type ProfileResponse,
  levelFromXp,
  levelUpCoins,
  xpForMatch,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from "@mini-sumo/shared";
import { ECONOMY, getArena, getItem } from "./config.js";
import { consoleEventSink, type EconomyEventSink } from "./events.js";
import { computePrize } from "./prize.js";

export class EconomyError extends Error {
  constructor(
    readonly code:
      | "disabled"
      | "unknown_account"
      | "insufficient_funds"
      | "invalid_amount"
      | "unknown_item"
      | "item_unavailable"
      | "unknown_friend"
      | "not_friends"
      | "friend_offline"
      | "bad_request"
      | "unknown_arena"
      | "arena_locked"
      | "already_entered"
      | "currency_disabled",
    message: string,
  ) {
    super(message);
  }
}

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  appearance TEXT NOT NULL DEFAULT '{}',
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  reward_day TEXT NOT NULL DEFAULT '',
  reward_day_total INTEGER NOT NULL DEFAULT 0,
  bonus_day TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS wallets (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  currency TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  PRIMARY KEY (account_id, currency)
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  match_id TEXT,
  item_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  balance_after INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_account ON transactions(account_id, created_at);
CREATE TABLE IF NOT EXISTS ownership (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  item_id TEXT NOT NULL,
  transaction_id TEXT,
  acquired_at TEXT NOT NULL,
  PRIMARY KEY (account_id, item_id)
);
CREATE TABLE IF NOT EXISTS arena_entries (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  arena_id TEXT NOT NULL,
  fee INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'locked', 'settled', 'refunded')),
  match_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- At most one active (paid, unsettled) entry per player per room.
CREATE UNIQUE INDEX IF NOT EXISTS arena_entries_active ON arena_entries(room_id, account_id)
  WHERE status IN ('reserved', 'locked');
CREATE TABLE IF NOT EXISTS settlements (
  match_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  arena_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  winner_account_id TEXT,
  players INTEGER NOT NULL,
  pool INTEGER NOT NULL,
  prize INTEGER NOT NULL,
  sink INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
-- One processed result (stats + free rewards) per player per match.
CREATE TABLE IF NOT EXISTS match_results (
  match_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  won INTEGER NOT NULL,
  reward INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (match_id, account_id)
);
`;

/** Names of the bot players (leaderboard regulars and in-game bots). */
const BOT_PLAYERS = [
  "Kenta", "Mika", "Hiro", "Sora", "Yuki", "Aiko", "Ren", "Nina", "Omid", "Sara",
  "Arash", "Maya", "Luca", "Kai", "Lina", "Babak", "Neda", "Kaveh", "Shirin", "Mateo",
] as const;

/** Small deterministic PRNG (bot seeding and the daily drift). */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface AccountRow {
  id: string;
  xp: number;
  is_bot?: number;
  name?: string;
  profile_updated_at?: string;
  appearance: string;
  matches: number;
  wins: number;
  reward_day: string;
  reward_day_total: number;
  bonus_day: string;
}

interface EntryRow {
  id: string;
  room_id: string;
  account_id: string;
  arena_id: string;
  fee: number;
  status: "reserved" | "locked" | "settled" | "refunded";
  match_id: string | null;
}

interface SettlementRow {
  match_id: string;
  outcome: "won" | "draw" | "void" | "empty";
  winner_account_id: string | null;
  players: number;
  pool: number;
  prize: number;
  sink: number;
}

export interface Settlement {
  matchId: string;
  outcome: "won" | "draw" | "void" | "empty";
  winnerAccountId: string | null;
  players: number;
  pool: number;
  prize: number;
  sink: number;
  /** True when this call created the settlement; false when it already existed. */
  created: boolean;
}

export interface MatchParticipant {
  accountId: string;
  won: boolean;
  /** Finished the round (didn't leave). */
  completed: boolean;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const utcDay = (date: Date) => date.toISOString().slice(0, 10);
const row = <T>(value: unknown): T | undefined => value as T | undefined;
const rows = <T>(value: unknown): T[] => value as T[];

/**
 * Server-authoritative wallet and ledger on SQLite (node:sqlite, built into Node 22.13+).
 * Every balance change goes through apply(), which in one transaction updates the wallet
 * (never below zero) and appends a ledger row with a unique idempotency key, so retries
 * return the original result instead of charging or paying twice.
 */
export class Economy {
  private readonly db: DatabaseSync;
  private depth = 0;

  constructor(
    path: string,
    readonly flags: EconomyFlags,
    private readonly emit: EconomyEventSink = consoleEventSink,
    private readonly now: () => Date = () => new Date(),
    /** Seed the bot players (off in tests that count players). */
    private readonly botPlayers = true,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
    // Migration: XP for levels (added after the first schema).
    const columns = rows<{ name: string }>(this.db.prepare("PRAGMA table_info(accounts)").all());
    if (!columns.some((c) => c.name === "xp")) this.db.exec("ALTER TABLE accounts ADD COLUMN xp INTEGER NOT NULL DEFAULT 0");
    // Migration: name and when the name / look last changed (profile sync from devices).
    if (!columns.some((c) => c.name === "name")) this.db.exec("ALTER TABLE accounts ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    if (!columns.some((c) => c.name === "profile_updated_at")) this.db.exec("ALTER TABLE accounts ADD COLUMN profile_updated_at TEXT NOT NULL DEFAULT ''");
    // Bot players: real accounts for the leaderboard, friends and in-game bots.
    if (!columns.some((c) => c.name === "is_bot")) this.db.exec("ALTER TABLE accounts ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0");
    this.db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    if (this.botPlayers) this.ensureBots();
  }

  // ------------------------------------------------------------ bot players

  /** Bot player accounts (the leaderboard regulars; in-game bots take their identities). */
  botAccounts(): { id: string; name: string; xp: number }[] {
    return rows<{ id: string; name: string; xp: number }>(this.db.prepare("SELECT id, name, xp FROM accounts WHERE is_bot = 1 ORDER BY id").all());
  }

  isBot(accountId: string): boolean {
    return Boolean(row<{ is_bot: number }>(this.db.prepare("SELECT is_bot FROM accounts WHERE id = ?").get(accountId))?.is_bot);
  }

  /** Creates the bot players once (20 of them, spread over the leaderboard). */
  private ensureBots(): void {
    const existing = new Set(this.botAccounts().map((b) => b.id));
    const rng = seededRandom(20261018);
    const timestamp = this.timestamp();
    for (let i = 0; i < BOT_PLAYERS.length; i++) {
      const id = `bot_${String(i + 1).padStart(2, "0")}`;
      const xp = Math.round(300 + rng() * rng() * 24_000);
      const appearance = {
        hair: Math.floor(rng() * APPEARANCE_LIMITS.hair),
        hairColor: Math.floor(rng() * APPEARANCE_LIMITS.hairColor),
        face: Math.floor(rng() * APPEARANCE_LIMITS.face),
        outfit: Math.floor(rng() * APPEARANCE_LIMITS.outfit),
        avatar: Math.floor(rng() * APPEARANCE_LIMITS.avatar),
      };
      if (existing.has(id)) continue;
      this.db
        .prepare(
          "INSERT INTO accounts (id, token_hash, created_at, xp, appearance, matches, wins, name, profile_updated_at, is_bot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        )
        .run(id, `bot:${id}`, timestamp, xp, JSON.stringify(appearance), Math.round(xp / 40), Math.round(xp / 90), BOT_PLAYERS[i]!, timestamp);
    }
  }

  /** Once per day (UTC) every bot player gains some XP, so the leaderboard keeps moving. */
  driftBots(): void {
    const today = utcDay(this.now());
    const last = row<{ value: string }>(this.db.prepare("SELECT value FROM meta WHERE key = 'bot_day'").get())?.value;
    if (last === today) return;
    const rng = seededRandom(Number(today.replaceAll("-", "")));
    this.tx(() => {
      for (const bot of this.botAccounts()) {
        const gain = Math.round(rng() * rng() * 900);
        const won = Math.round(gain / 120);
        this.db
          .prepare("UPDATE accounts SET xp = xp + ?, matches = matches + ?, wins = wins + ? WHERE id = ?")
          .run(gain, Math.max(1, Math.round(gain / 40)), won, bot.id);
      }
      this.db.prepare("INSERT INTO meta (key, value) VALUES ('bot_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(today);
    });
  }

  /**
   * Players ranked by total XP (named players only; equal XP shares a rank, earlier accounts
   * first). Includes your own row even when you're not in the top list.
   */
  leaderboard(accountId: string, limit = 100): LeaderboardResponse {
    this.driftBots();
    const count = Math.max(1, Math.min(200, Math.floor(limit) || 100));
    const top = rows<{ id: string; name: string; xp: number }>(
      this.db
        .prepare("SELECT id, name, xp FROM accounts WHERE name != '' ORDER BY xp DESC, created_at ASC LIMIT ?")
        .all(count),
    );
    const rankOf = (xp: number) =>
      (row<{ n: number }>(this.db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE name != '' AND xp > ?").get(xp))?.n ?? 0) + 1;
    const entry = (id: string, name: string, xp: number): LeaderboardEntry => ({
      rank: rankOf(xp),
      accountId: id,
      name,
      avatar: this.appearanceOf(id).avatar,
      level: levelFromXp(xp).level,
      xp,
    });
    const me = this.account(accountId);
    const total = row<{ n: number }>(this.db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE name != ''").get())?.n ?? 0;
    return {
      top: top.map((r) => entry(r.id, r.name, r.xp)),
      you: entry(accountId, me.name || "You", me.xp),
      total,
    };
  }

  /** The database, for features that keep their own tables (friends). */
  get database(): DatabaseSync {
    return this.db;
  }

  /** What others may see of an account (friends list and profile). */
  publicAccount(accountId: string): { name: string; avatar: number; level: number; matches: number; wins: number; appearance: Appearance } | null {
    const account = row<AccountRow>(this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId));
    if (!account) return null;
    const appearance = this.appearanceOf(accountId);
    return {
      name: account.name || "Wrestler",
      appearance,
      avatar: appearance.avatar,
      level: levelFromXp(account.xp).level,
      matches: account.matches,
      wins: account.wins,
    };
  }

  close(): void {
    this.db.close();
  }

  // ------------------------------------------------------------------ transactions

  /** Runs fn atomically (BEGIN IMMEDIATE … COMMIT, ROLLBACK on error). Re-entrant. */
  private tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.depth++;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.depth--;
    }
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  /**
   * Applies a signed amount to a wallet and records it. Idempotent by key: a repeated key
   * returns the original transaction without touching the balance.
   */
  private apply(input: {
    accountId: string;
    currency: Currency;
    amount: number;
    category: LedgerCategory;
    reason: string;
    key: string;
    matchId?: string | null;
    itemId?: string | null;
  }): { transactionId: string; balance: number; duplicate: boolean } {
    if (!Number.isInteger(input.amount) || input.amount === 0) throw new EconomyError("invalid_amount", "Invalid amount.");
    if (input.currency === Currency.Gems && !this.flags.premiumCurrency) {
      throw new EconomyError("currency_disabled", "This currency is not available.");
    }
    return this.tx(() => {
      const existing = row<{ id: string; balance_after: number }>(
        this.db.prepare("SELECT id, balance_after FROM transactions WHERE idempotency_key = ?").get(input.key),
      );
      if (existing) return { transactionId: existing.id, balance: existing.balance_after, duplicate: true };

      this.db
        .prepare("INSERT INTO wallets (account_id, currency, balance) VALUES (?, ?, 0) ON CONFLICT DO NOTHING")
        .run(input.accountId, input.currency);
      const changed = this.db
        .prepare("UPDATE wallets SET balance = balance + ? WHERE account_id = ? AND currency = ? AND balance + ? >= 0")
        .run(input.amount, input.accountId, input.currency, input.amount);
      if (Number(changed.changes) !== 1) throw new EconomyError("insufficient_funds", "Not enough Sumo Coins.");

      const balance = this.balance(input.accountId, input.currency);
      const transactionId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO transactions (id, account_id, currency, amount, category, reason, match_id, item_id, idempotency_key, balance_after, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          transactionId,
          input.accountId,
          input.currency,
          input.amount,
          input.category,
          input.reason,
          input.matchId ?? null,
          input.itemId ?? null,
          input.key,
          balance,
          this.timestamp(),
        );
      return { transactionId, balance, duplicate: false };
    });
  }

  // ------------------------------------------------------------------ accounts

  /** Creates a device-bound guest account with the welcome grant. Returns the secret token once. */
  createGuest(): { accountId: string; token: string } {
    const accountId = `acc_${randomBytes(12).toString("hex")}`;
    const token = randomBytes(32).toString("base64url");
    this.tx(() => {
      this.db
        .prepare("INSERT INTO accounts (id, token_hash, created_at, appearance) VALUES (?, ?, ?, ?)")
        .run(accountId, sha256(token), this.timestamp(), "{}");
      for (const currency of Object.values(Currency)) {
        this.db.prepare("INSERT INTO wallets (account_id, currency, balance) VALUES (?, ?, 0)").run(accountId, currency);
      }
      if (ECONOMY.welcomeCoins > 0) {
        this.apply({
          accountId,
          currency: Currency.Coins,
          amount: ECONOMY.welcomeCoins,
          category: "welcome",
          reason: "Welcome gift",
          key: `welcome:${accountId}`,
        });
      }
    });
    this.emit("account_created", { accountId });
    return { accountId, token };
  }

  /** Resolves a bearer token to an account id, or null. Never trusts a client-sent id. */
  authenticate(token: unknown): string | null {
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
    const found = row<{ id: string }>(this.db.prepare("SELECT id FROM accounts WHERE token_hash = ?").get(sha256(token)));
    return found?.id ?? null;
  }

  private account(accountId: string): AccountRow {
    const found = row<AccountRow>(this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId));
    if (!found) throw new EconomyError("unknown_account", "Unknown account.");
    return found;
  }

  balance(accountId: string, currency: Currency = Currency.Coins): number {
    const found = row<{ balance: number }>(
      this.db.prepare("SELECT balance FROM wallets WHERE account_id = ? AND currency = ?").get(accountId, currency),
    );
    return found?.balance ?? 0;
  }

  owned(accountId: string): Set<string> {
    const items = rows<{ item_id: string }>(this.db.prepare("SELECT item_id FROM ownership WHERE account_id = ?").all(accountId));
    return new Set([...STARTER_ITEMS, ...items.map((i) => i.item_id)]);
  }

  profile(accountId: string): ProfileResponse {
    const account = this.account(accountId);
    const today = utcDay(this.now());
    const earned = account.reward_day === today ? account.reward_day_total : 0;
    return {
      accountId,
      name: account.name ?? "",
      profileUpdatedAt: account.profile_updated_at ?? "",
      balances: { coins: this.balance(accountId, Currency.Coins), gems: this.balance(accountId, Currency.Gems) },
      owned: [...this.owned(accountId)],
      appearance: this.appearanceOf(accountId),
      stats: { matches: account.matches, wins: account.wins, coinsEarned: this.coinsEarned(accountId) },
      level: levelFromXp(account.xp),
      daily: { earned, cap: ECONOMY.rewards.dailyCap, firstMatchBonusAvailable: account.bonus_day !== today },
    };
  }

  /** Coins won or earned through play (prizes, rewards, daily bonuses). */
  private coinsEarned(accountId: string): number {
    const found = row<{ total: number | null }>(
      this.db
        .prepare(
          "SELECT SUM(amount) AS total FROM transactions WHERE account_id = ? AND amount > 0 AND category IN ('arena_prize', 'match_reward', 'daily_bonus', 'level_up')",
        )
        .get(accountId),
    );
    return found?.total ?? 0;
  }

  ledger(accountId: string, limit = 50): LedgerEntry[] {
    const count = Math.max(1, Math.min(200, Math.floor(limit) || 50));
    return rows<{
      id: string;
      currency: Currency;
      amount: number;
      category: LedgerCategory;
      reason: string;
      match_id: string | null;
      item_id: string | null;
      created_at: string;
    }>(
      this.db
        .prepare(
          "SELECT id, currency, amount, category, reason, match_id, item_id, created_at FROM transactions WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
        )
        .all(accountId, count),
    ).map((t) => ({
      id: t.id,
      currency: t.currency,
      amount: t.amount,
      category: t.category,
      reason: t.reason,
      matchId: t.match_id,
      itemId: t.item_id,
      createdAt: t.created_at,
    }));
  }

  // ------------------------------------------------------------------ cosmetics

  appearanceOf(accountId: string): Appearance {
    const account = this.account(accountId);
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(account.appearance);
    } catch {
      parsed = {};
    }
    // Bot players wear anything.
    if (account.is_bot) return sanitizeAppearance(parsed);
    return restrictToOwned(sanitizeAppearance(parsed), this.owned(accountId));
  }

  /**
   * Merges a device's copy of the profile (sent when it reaches the server again).
   * Name and look: the newer side wins (the look only with owned items). XP, matches and
   * wins: the higher value wins, so progress made offline is kept. Level-up coins are not
   * granted for synced XP (coins only come from bouts played on the server).
   */
  syncProfile(accountId: string, raw: unknown): ProfileResponse {
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const account = this.account(accountId);
    const at = typeof body.updatedAt === "string" && !Number.isNaN(Date.parse(body.updatedAt)) ? new Date(body.updatedAt) : null;
    // Never trust a clock far in the future.
    const clientAt = at && at.getTime() <= this.now().getTime() + 5 * 60_000 ? at.toISOString() : "";
    const serverAt = account.profile_updated_at ?? "";
    if (clientAt && clientAt > serverAt) {
      const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH) : "";
      const appearance = restrictToOwned(sanitizeAppearance(body.appearance), this.owned(accountId));
      this.db
        .prepare("UPDATE accounts SET name = ?, appearance = ?, profile_updated_at = ? WHERE id = ?")
        .run(name || account.name || "", JSON.stringify(appearance), clientAt, accountId);
    }
    const count = (value: unknown, max: number) =>
      typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
    this.db
      .prepare("UPDATE accounts SET xp = MAX(xp, ?), matches = MAX(matches, ?), wins = MAX(wins, ?) WHERE id = ?")
      .run(count(body.xp, 50_000_000), count(body.matches, 10_000_000), count(body.wins, 10_000_000), accountId);
    return this.profile(accountId);
  }

  /** Stores the equipped look; unowned options fall back to the default. */
  saveAppearance(accountId: string, raw: unknown): Appearance {
    const appearance = restrictToOwned(sanitizeAppearance(raw), this.owned(accountId));
    this.db.prepare("UPDATE accounts SET appearance = ? WHERE id = ?").run(JSON.stringify(appearance), accountId);
    return appearance;
  }

  /**
   * Buys a cosmetic with Sumo Coins. Price comes from the server catalog only. Idempotent by
   * key; buying an item you already own never charges again.
   */
  purchase(accountId: string, itemId: unknown, idempotencyKey: unknown): { itemId: string; balance: number; alreadyOwned: boolean } {
    if (!this.flags.economy || !this.flags.shop) throw new EconomyError("disabled", "The shop is not available.");
    const item = getItem(itemId);
    if (!item) {
      this.emit("cosmetic_purchase_rejected", { accountId, reason: "unknown_item" });
      throw new EconomyError("unknown_item", "That item doesn't exist.");
    }
    if (!item.available) throw new EconomyError("item_unavailable", "That item is not available.");
    if (item.currency !== Currency.Coins) throw new EconomyError("currency_disabled", "That item is not available yet.");
    const key = typeof idempotencyKey === "string" && /^[\w-]{8,64}$/.test(idempotencyKey) ? idempotencyKey : randomUUID();

    return this.tx(() => {
      this.account(accountId);
      if (this.owned(accountId).has(item.id)) {
        return { itemId: item.id, balance: this.balance(accountId), alreadyOwned: true };
      }
      try {
        const result = this.apply({
          accountId,
          currency: item.currency,
          amount: -item.price,
          category: "cosmetic_purchase",
          reason: `Bought ${item.name}`,
          key: `purchase:${accountId}:${key}`,
          itemId: item.id,
        });
        this.db
          .prepare("INSERT INTO ownership (account_id, item_id, transaction_id, acquired_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
          .run(accountId, item.id, result.transactionId, this.timestamp());
        this.emit("cosmetic_purchased", { accountId, itemId: item.id, price: item.price });
        return { itemId: item.id, balance: result.balance, alreadyOwned: false };
      } catch (error) {
        if (error instanceof EconomyError) this.emit("cosmetic_purchase_rejected", { accountId, itemId: item.id, reason: error.code });
        throw error;
      }
    });
  }

  // ------------------------------------------------------------------ arenas

  /** Checks arena unlock requirements against the account's stats. */
  canEnter(accountId: string, arenaId: unknown): { ok: true } | { ok: false; error: EconomyError } {
    const arena = getArena(arenaId);
    if (!arena || !arena.enabled) return { ok: false, error: new EconomyError("unknown_arena", "That arena is not available.") };
    const account = this.account(accountId);
    if (levelFromXp(account.xp).level < arena.requiredLevel) {
      return { ok: false, error: new EconomyError("arena_locked", `${arena.name} unlocks at level ${arena.requiredLevel}.`) };
    }
    if (arena.entryFee > 0 && this.balance(accountId) < arena.entryFee) {
      return { ok: false, error: new EconomyError("insufficient_funds", `You need ${arena.entryFee} Sumo Coins to enter ${arena.name}.`) };
    }
    return { ok: true };
  }

  /**
   * Pays the entry fee for one room: one atomic debit plus an entry record. A player can have
   * only one active entry per room (enforced by a unique index), so retries never double-charge.
   */
  reserveEntry(accountId: string, arenaId: string, roomId: string): { entryId: string; fee: number; balance: number } {
    if (!this.flags.economy) throw new EconomyError("disabled", "Paid arenas are not available.");
    const arena = getArena(arenaId);
    if (!arena || !arena.enabled) throw new EconomyError("unknown_arena", "That arena is not available.");
    const check = this.canEnter(accountId, arenaId);
    if (!check.ok && check.error.code !== "insufficient_funds") throw check.error;

    try {
      return this.tx(() => {
        const active = row<{ id: string }>(
          this.db
            .prepare("SELECT id FROM arena_entries WHERE room_id = ? AND account_id = ? AND status IN ('reserved', 'locked')")
            .get(roomId, accountId),
        );
        if (active) throw new EconomyError("already_entered", "You are already in this match.");
        const entryId = randomUUID();
        let balance = this.balance(accountId);
        if (arena.entryFee > 0) {
          balance = this.apply({
            accountId,
            currency: Currency.Coins,
            amount: -arena.entryFee,
            category: "arena_entry",
            reason: `${arena.name} entry`,
            key: `entry:${entryId}`,
          }).balance;
        }
        const ts = this.timestamp();
        this.db
          .prepare(
            "INSERT INTO arena_entries (id, room_id, account_id, arena_id, fee, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)",
          )
          .run(entryId, roomId, accountId, arena.id, arena.entryFee, ts, ts);
        this.emit("arena_entry_accepted", { accountId, arenaId: arena.id, roomId, fee: arena.entryFee });
        return { entryId, fee: arena.entryFee, balance };
      });
    } catch (error) {
      if (error instanceof EconomyError) this.emit("arena_entry_rejected", { accountId, arenaId, reason: error.code });
      throw error;
    }
  }

  private refundEntry(entry: EntryRow, reason: string): number {
    if (entry.status !== "reserved" && entry.status !== "locked") return 0;
    this.db
      .prepare("UPDATE arena_entries SET status = 'refunded', updated_at = ? WHERE id = ? AND status IN ('reserved', 'locked')")
      .run(this.timestamp(), entry.id);
    if (entry.fee > 0) {
      this.apply({
        accountId: entry.account_id,
        currency: Currency.Coins,
        amount: entry.fee,
        category: "arena_refund",
        reason,
        key: `refund:${entry.id}`,
        matchId: entry.match_id,
      });
    }
    this.emit("arena_entry_refunded", { accountId: entry.account_id, roomId: entry.room_id, fee: entry.fee, reason });
    return entry.fee;
  }

  /** Refunds a player's entry if the match hasn't started for them yet (left the lobby). */
  refundReserved(roomId: string, accountId: string, reason = "Left before the bout started"): number {
    return this.tx(() => {
      const entry = row<EntryRow>(
        this.db.prepare("SELECT * FROM arena_entries WHERE room_id = ? AND account_id = ? AND status = 'reserved'").get(roomId, accountId),
      );
      return entry ? this.refundEntry(entry, reason) : 0;
    });
  }

  /** The bout started: entries of everyone in it can no longer be refunded by leaving. */
  lockEntries(roomId: string, matchId: string, accountIds: readonly string[]): number {
    return this.tx(() => {
      let locked = 0;
      for (const accountId of accountIds) {
        const changed = this.db
          .prepare(
            "UPDATE arena_entries SET status = 'locked', match_id = ?, updated_at = ? WHERE room_id = ? AND account_id = ? AND status = 'reserved'",
          )
          .run(matchId, this.timestamp(), roomId, accountId);
        locked += Number(changed.changes);
      }
      this.emit("match_started", { roomId, matchId, players: locked });
      return locked;
    });
  }

  /**
   * Pays out a finished paid match exactly once.
   * - Winner (with a locked entry): prize = pool − economy fee (see computePrize).
   * - Draw: every entry refunded, nothing removed.
   * - Winner without a paid entry or any inconsistency: void, every entry refunded.
   * A repeated call returns the stored settlement and changes nothing, even with another winner.
   */
  settleMatch(input: { matchId: string; roomId: string; arenaId: string; winnerAccountId: string | null }): Settlement {
    return this.tx(() => {
      const existing = row<SettlementRow>(this.db.prepare("SELECT * FROM settlements WHERE match_id = ?").get(input.matchId));
      if (existing) {
        return {
          matchId: existing.match_id,
          outcome: existing.outcome,
          winnerAccountId: existing.winner_account_id,
          players: existing.players,
          pool: existing.pool,
          prize: existing.prize,
          sink: existing.sink,
          created: false,
        };
      }

      const arena = getArena(input.arenaId);
      const entries = rows<EntryRow>(
        this.db.prepare("SELECT * FROM arena_entries WHERE match_id = ? AND status = 'locked'").all(input.matchId),
      );
      const pool = entries.reduce((sum, e) => sum + e.fee, 0);
      const winnerEntry = input.winnerAccountId ? entries.find((e) => e.account_id === input.winnerAccountId) : undefined;

      let outcome: Settlement["outcome"];
      let prize = 0;
      let sink = 0;
      if (entries.length === 0) {
        outcome = "empty";
      } else if (!input.winnerAccountId) {
        outcome = "draw";
        for (const entry of entries) this.refundEntry(entry, "Draw: entry refunded");
      } else if (!winnerEntry || !arena || entries.some((e) => e.fee !== entries[0]!.fee)) {
        outcome = "void";
        for (const entry of entries) this.refundEntry(entry, "Match could not be settled: entry refunded");
      } else {
        outcome = "won";
        const result = computePrize(winnerEntry.fee, entries.length, arena.economyFeePercent);
        prize = result.prize;
        sink = result.sink;
        if (prize > 0) {
          this.apply({
            accountId: winnerEntry.account_id,
            currency: Currency.Coins,
            amount: prize,
            category: "arena_prize",
            reason: `${arena.name} win`,
            key: `prize:${input.matchId}`,
            matchId: input.matchId,
          });
        }
        this.db
          .prepare("UPDATE arena_entries SET status = 'settled', updated_at = ? WHERE match_id = ? AND status = 'locked'")
          .run(this.timestamp(), input.matchId);
      }

      this.db
        .prepare(
          "INSERT INTO settlements (match_id, room_id, arena_id, outcome, winner_account_id, players, pool, prize, sink, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          input.matchId,
          input.roomId,
          input.arenaId,
          outcome,
          outcome === "won" ? input.winnerAccountId : null,
          entries.length,
          pool,
          prize,
          sink,
          this.timestamp(),
        );
      this.emit("match_settled", { matchId: input.matchId, arenaId: input.arenaId, outcome, players: entries.length, pool, prize, sink });
      return {
        matchId: input.matchId,
        outcome,
        winnerAccountId: outcome === "won" ? input.winnerAccountId : null,
        players: entries.length,
        pool,
        prize,
        sink,
        created: true,
      };
    });
  }

  /**
   * Records stats and grants free rewards once per player per match.
   * Free rewards only when `rewarded` (training arena), the round lasted long enough and the
   * player finished it; capped per UTC day. Returns coins granted per account.
   */
  recordMatch(input: {
    matchId: string;
    durationMs: number;
    rewarded: boolean;
    participants: readonly MatchParticipant[];
    arenaId?: string;
  }): Map<string, number> {
    return this.recordMatchDetailed(input).rewards;
  }

  /**
   * Records a finished bout: stats and XP for everyone who finished it (any length),
   * level-up coins, and the free training rewards (only for bouts of at least
   * minMatchDurationMs, so very short bouts can't farm coins). Returns the coins and the
   * XP / level change per account.
   */
  recordMatchDetailed(input: {
    matchId: string;
    durationMs: number;
    rewarded: boolean;
    participants: readonly MatchParticipant[];
    arenaId?: string;
  }): { rewards: Map<string, number>; progress: Map<string, { xp: number; levelBefore: number; levelAfter: number; levelCoins: number }> } {
    const granted = new Map<string, number>();
    const progress = new Map<string, { xp: number; levelBefore: number; levelAfter: number; levelCoins: number }>();
    if (!this.flags.economy) return { rewards: granted, progress };
    const today = utcDay(this.now());
    const r = ECONOMY.rewards;
    this.tx(() => {
      for (const p of input.participants) {
        const account = row<AccountRow>(this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(p.accountId));
        if (!account) continue;
        const inserted = this.db
          .prepare("INSERT INTO match_results (match_id, account_id, won, reward, created_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT DO NOTHING")
          .run(input.matchId, p.accountId, p.won ? 1 : 0, this.timestamp());
        if (Number(inserted.changes) !== 1) continue; // already processed

        const counts = p.completed;
        if (counts) {
          const xp = xpForMatch(input.arenaId ?? "training", p.won, true);
          const before = levelFromXp(account.xp).level;
          const after = levelFromXp(account.xp + xp).level;
          progress.set(p.accountId, { xp, levelBefore: before, levelAfter: after, levelCoins: levelUpCoins(before, after) });
          this.db
            .prepare("UPDATE accounts SET matches = matches + 1, wins = wins + ?, xp = xp + ? WHERE id = ?")
            .run(p.won ? 1 : 0, xp, p.accountId);
          const levelCoins = levelUpCoins(before, after);
          if (levelCoins > 0) {
            this.apply({
              accountId: p.accountId,
              currency: Currency.Coins,
              amount: levelCoins,
              category: "level_up",
              reason: `Reached level ${after}`,
              key: `levelup:${input.matchId}:${p.accountId}`,
              matchId: input.matchId,
            });
          }
        }
        if (!input.rewarded || !counts || input.durationMs < r.minMatchDurationMs) continue;

        const earnedToday = account.reward_day === today ? account.reward_day_total : 0;
        const bonus = account.bonus_day !== today ? r.firstMatchOfDay : 0;
        const amount = Math.min(r.participation + (p.won ? r.win : 0) + bonus, Math.max(0, r.dailyCap - earnedToday));
        if (amount <= 0) continue;
        this.apply({
          accountId: p.accountId,
          currency: Currency.Coins,
          amount,
          category: bonus > 0 ? "daily_bonus" : "match_reward",
          reason: bonus > 0 ? "Bout reward + first bout of the day" : p.won ? "Training win" : "Training bout",
          key: `reward:${input.matchId}:${p.accountId}`,
          matchId: input.matchId,
        });
        this.db
          .prepare("UPDATE accounts SET reward_day = ?, reward_day_total = ?, bonus_day = ? WHERE id = ?")
          .run(today, earnedToday + amount, bonus > 0 ? today : account.bonus_day, p.accountId);
        this.db.prepare("UPDATE match_results SET reward = ? WHERE match_id = ? AND account_id = ?").run(amount, input.matchId, p.accountId);
        granted.set(p.accountId, amount);
      }
    });
    if (granted.size > 0) this.emit("rewards_granted", { matchId: input.matchId, total: [...granted.values()].reduce((a, b) => a + b, 0) });
    return { rewards: granted, progress };
  }

  /** Refunds every unsettled entry of a room (cancelled before start, or disposed mid-match). */
  refundRoom(roomId: string, reason: string): number {
    return this.tx(() => {
      const entries = rows<EntryRow>(
        this.db.prepare("SELECT * FROM arena_entries WHERE room_id = ? AND status IN ('reserved', 'locked')").all(roomId),
      );
      let total = 0;
      for (const entry of entries) total += this.refundEntry(entry, reason);
      if (entries.length > 0) this.emit("match_cancelled", { roomId, refunded: entries.length, reason });
      return total;
    });
  }

  /**
   * Startup recovery: rooms live in memory, so after a restart no unsettled entry can still
   * belong to a running match. Refund them all.
   */
  recoverOrphanedEntries(): number {
    return this.tx(() => {
      const entries = rows<EntryRow>(this.db.prepare("SELECT * FROM arena_entries WHERE status IN ('reserved', 'locked')").all());
      for (const entry of entries) this.refundEntry(entry, "Server restarted: entry refunded");
      return entries.length;
    });
  }

  /** Sum of a player's ledger; used by tests and audits to check it matches the balance. */
  ledgerSum(accountId: string, currency: Currency = Currency.Coins): number {
    const found = row<{ total: number | null }>(
      this.db.prepare("SELECT SUM(amount) AS total FROM transactions WHERE account_id = ? AND currency = ?").get(accountId, currency),
    );
    return found?.total ?? 0;
  }

  settlement(matchId: string): SettlementRow | undefined {
    return row<SettlementRow>(this.db.prepare("SELECT * FROM settlements WHERE match_id = ?").get(matchId));
  }
}
