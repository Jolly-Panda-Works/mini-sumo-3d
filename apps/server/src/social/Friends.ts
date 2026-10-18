import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FriendEntry, FriendProfile, FriendsResponse, GameInvite } from "@mini-sumo/shared";
import { EconomyError, type Economy } from "../economy/Economy.js";
import { presence } from "./presence.js";

/**
 * Friends: every account has a short code; adding a code sends a request, accepting it makes
 * both friends. Presence is in memory (an account is online when the game called the API in
 * the last minute; the open game polls). Game invites are in memory too and expire.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const ONLINE_MS = 60_000;
const INVITE_TTL_MS = 2 * 60_000;
const MAX_FRIENDS = 100;
/** Bot players accept a friend request after this long. */
const BOT_ACCEPT_MS = 20_000;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS friend_codes (
  account_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS friendships (
  requester TEXT NOT NULL,
  addressee TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (requester, addressee)
);
CREATE INDEX IF NOT EXISTS friendships_addressee ON friendships (addressee);
`;

interface FriendshipRow {
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
}

export class Friends {
  private readonly db: DatabaseSync;
  private readonly seen = new Map<string, number>();
  private readonly invites = new Map<string, GameInvite[]>();

  /** Set by the server: puts an invited bot friend into a room (throws if it can't). */
  onBotInvite: ((botAccountId: string, roomId: string) => void) | null = null;

  constructor(
    private readonly economy: Economy,
    private readonly now: () => number = Date.now,
  ) {
    this.db = economy.database;
    this.db.exec(SCHEMA);
  }

  // ------------------------------------------------------------ presence

  /** Marks the account as online (called on every authenticated request). */
  touch(accountId: string): void {
    this.seen.set(accountId, this.now());
  }

  isOnline(accountId: string): boolean {
    // Bot players come and go: online about two hours in three, varying by the hour.
    if (this.economy.isBot(accountId)) return hash(`${accountId}:${Math.floor(this.now() / 3_600_000)}`) % 3 !== 0;
    return this.now() - (this.seen.get(accountId) ?? 0) < ONLINE_MS;
  }

  // ------------------------------------------------------------ codes and list

  codeOf(accountId: string): string {
    const existing = this.db.prepare("SELECT code FROM friend_codes WHERE account_id = ?").get(accountId) as { code: string } | undefined;
    if (existing) return existing.code;
    for (let attempt = 0; attempt < 20; attempt++) {
      const hex = randomBytes(CODE_LENGTH).toString("hex");
      let code = "";
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
      try {
        this.db.prepare("INSERT INTO friend_codes (account_id, code) VALUES (?, ?)").run(accountId, code);
        return code;
      } catch {
        // code taken: try another
      }
    }
    throw new Error("Couldn't create a friend code");
  }

  private entry(accountId: string): FriendEntry | null {
    const account = this.economy.publicAccount(accountId);
    if (!account) return null;
    const where = presence.get(accountId);
    return {
      accountId,
      name: account.name,
      avatar: account.avatar,
      level: account.level,
      online: this.isOnline(accountId) || Boolean(where),
      ...(where ? { activity: where.inMatch ? ("in_match" as const) : ("in_lobby" as const), roomId: where.roomId } : {}),
    };
  }

  private relation(a: string, b: string): FriendshipRow | undefined {
    return this.db
      .prepare("SELECT * FROM friendships WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)")
      .get(a, b, b, a) as FriendshipRow | undefined;
  }

  areFriends(a: string, b: string): boolean {
    return this.relation(a, b)?.status === "accepted";
  }

  list(accountId: string): FriendsResponse {
    // Bot players accept requests on their own after a short while.
    this.db
      .prepare(
        "UPDATE friendships SET status = 'accepted' WHERE requester = ? AND status = 'pending' AND created_at <= ? AND addressee IN (SELECT id FROM accounts WHERE is_bot = 1)",
      )
      .run(accountId, new Date(this.now() - BOT_ACCEPT_MS).toISOString());
    const rows = this.db
      .prepare("SELECT * FROM friendships WHERE requester = ? OR addressee = ? ORDER BY created_at DESC")
      .all(accountId, accountId) as unknown as FriendshipRow[];
    const friends: FriendEntry[] = [];
    const incoming: FriendEntry[] = [];
    const outgoing: FriendEntry[] = [];
    for (const r of rows) {
      const other = r.requester === accountId ? r.addressee : r.requester;
      const entry = this.entry(other);
      if (!entry) continue;
      if (r.status === "accepted") friends.push(entry);
      else if (r.addressee === accountId) incoming.push(entry);
      else outgoing.push(entry);
    }
    // Online first, then by name.
    friends.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    return { code: this.codeOf(accountId), friends, incoming, outgoing };
  }

  // ------------------------------------------------------------ requests

  /** Sends a request to the owner of `code`; if they already asked you, you become friends. */
  request(accountId: string, rawCode: unknown): FriendsResponse {
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    if (code.length !== CODE_LENGTH) throw new EconomyError("bad_request", "That code doesn't look right.");
    const found = this.db.prepare("SELECT account_id FROM friend_codes WHERE code = ?").get(code) as { account_id: string } | undefined;
    if (!found) throw new EconomyError("unknown_friend", "No wrestler has that code.");
    return this.requestAccount(accountId, found.account_id);
  }

  /** Sends a request to a player you met in a bout (by account; bots included). */
  requestById(accountId: string, otherId: unknown): FriendsResponse {
    if (typeof otherId !== "string" || !this.economy.publicAccount(otherId)) throw new EconomyError("unknown_friend", "That wrestler can't be found.");
    return this.requestAccount(accountId, otherId);
  }

  private requestAccount(accountId: string, other: string): FriendsResponse {
    if (other === accountId) throw new EconomyError("bad_request", "That's your own code.");
    const existing = this.relation(accountId, other);
    if (existing?.status === "accepted") return this.list(accountId);
    if (existing && existing.requester === other) {
      // They asked first: accept.
      this.db.prepare("UPDATE friendships SET status = 'accepted' WHERE requester = ? AND addressee = ?").run(other, accountId);
      return this.list(accountId);
    }
    if (!existing) {
      const count = (this.db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE requester = ? OR addressee = ?").get(accountId, accountId) as { n: number }).n;
      if (count >= MAX_FRIENDS) throw new EconomyError("bad_request", "Your friends list is full.");
      this.db
        .prepare("INSERT INTO friendships (requester, addressee, status, created_at) VALUES (?, ?, 'pending', ?)")
        .run(accountId, other, new Date(this.now()).toISOString());
    }
    return this.list(accountId);
  }

  respond(accountId: string, otherId: unknown, accept: unknown): FriendsResponse {
    if (typeof otherId !== "string") throw new EconomyError("bad_request", "Invalid request.");
    const pending = this.db
      .prepare("SELECT * FROM friendships WHERE requester = ? AND addressee = ? AND status = 'pending'")
      .get(otherId, accountId) as FriendshipRow | undefined;
    if (!pending) throw new EconomyError("unknown_friend", "That request is gone.");
    if (accept === true) this.db.prepare("UPDATE friendships SET status = 'accepted' WHERE requester = ? AND addressee = ?").run(otherId, accountId);
    else this.db.prepare("DELETE FROM friendships WHERE requester = ? AND addressee = ?").run(otherId, accountId);
    return this.list(accountId);
  }

  /** Removes a friend, or cancels a request either way. */
  remove(accountId: string, otherId: unknown): FriendsResponse {
    if (typeof otherId !== "string") throw new EconomyError("bad_request", "Invalid request.");
    this.db
      .prepare("DELETE FROM friendships WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)")
      .run(accountId, otherId, otherId, accountId);
    return this.list(accountId);
  }

  /** Anyone's public profile (from the leaderboard), with how you're connected. */
  publicProfile(accountId: string, otherId: unknown): FriendProfile {
    if (typeof otherId !== "string") throw new EconomyError("unknown_friend", "That wrestler can't be found.");
    const account = this.economy.publicAccount(otherId);
    if (!account) throw new EconomyError("unknown_friend", "That wrestler can't be found.");
    const rel = this.relation(accountId, otherId);
    const relation: FriendProfile["relation"] =
      otherId === accountId ? "self" : !rel ? "none" : rel.status === "accepted" ? "friend" : rel.requester === accountId ? "outgoing" : "incoming";
    return {
      accountId: otherId,
      name: account.name,
      avatar: account.avatar,
      level: account.level,
      online: this.isOnline(otherId),
      matches: account.matches,
      wins: account.wins,
      appearance: account.appearance,
      relation,
    };
  }

  /** A friend's profile (only friends and pending requests can be viewed). */
  profile(accountId: string, otherId: unknown): FriendProfile {
    if (typeof otherId !== "string" || !this.relation(accountId, otherId)) throw new EconomyError("unknown_friend", "Not on your friends list.");
    const account = this.economy.publicAccount(otherId);
    if (!account) throw new EconomyError("unknown_friend", "Not on your friends list.");
    return {
      accountId: otherId,
      name: account.name,
      avatar: account.avatar,
      level: account.level,
      online: this.isOnline(otherId),
      matches: account.matches,
      wins: account.wins,
      appearance: account.appearance,
    };
  }

  // ------------------------------------------------------------ game invites

  invite(accountId: string, otherId: unknown, roomId: unknown): GameInvite {
    if (typeof otherId !== "string" || typeof roomId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) {
      throw new EconomyError("bad_request", "Invalid request.");
    }
    if (!this.areFriends(accountId, otherId)) throw new EconomyError("not_friends", "You can only invite friends.");
    if (!this.isOnline(otherId)) throw new EconomyError("friend_offline", "Your friend isn't online right now.");
    // A bot friend joins the room as a bot (when the room allows bots).
    if (this.economy.isBot(otherId)) {
      if (!this.onBotInvite) throw new EconomyError("bad_request", "Bots can't be invited right now.");
      this.onBotInvite(otherId, roomId);
      const bot = this.economy.publicAccount(otherId);
      return { id: randomBytes(8).toString("hex"), from: { accountId: otherId, name: bot?.name ?? "Bot", avatar: bot?.avatar ?? 0 }, roomId, createdAt: this.now() };
    }
    const me = this.economy.publicAccount(accountId);
    const invite: GameInvite = {
      id: randomBytes(8).toString("hex"),
      from: { accountId, name: me?.name ?? "A friend", avatar: me?.avatar ?? 0 },
      roomId,
      createdAt: this.now(),
    };
    // One live invite per friend: a new one replaces the old.
    const list = this.pendingInvites(otherId).filter((i) => i.from.accountId !== accountId);
    list.push(invite);
    this.invites.set(otherId, list);
    return invite;
  }

  pendingInvites(accountId: string): GameInvite[] {
    const fresh = (this.invites.get(accountId) ?? []).filter((i) => this.now() - i.createdAt < INVITE_TTL_MS);
    if (fresh.length) this.invites.set(accountId, fresh);
    else this.invites.delete(accountId);
    return fresh;
  }

  dismissInvite(accountId: string, inviteId: unknown): void {
    const left = this.pendingInvites(accountId).filter((i) => i.id !== inviteId);
    if (left.length) this.invites.set(accountId, left);
    else this.invites.delete(accountId);
  }
}
