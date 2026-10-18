import { AVATARS, FACES, HAIR_COLORS, HAIR_STYLES, OUTFITS, type Appearance } from "./appearance.js";

/**
 * Client-facing economy contract. Authoritative prices, fees and rewards live on the server
 * (apps/server/src/economy/config.ts); the client only displays what /api/catalog returns.
 * Sumo Coins are virtual: they can't be bought with money, transferred or cashed out.
 */
export const Currency = {
  Coins: "coins",
  /** Future premium currency. Disabled: no way to earn, buy or spend it. */
  Gems: "gems",
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

// ---------------------------------------------------------------- cosmetic item ids

export type CosmeticCategory = keyof Appearance;

const OPTIONS: Record<CosmeticCategory, readonly { label: string; id?: string }[]> = {
  hair: HAIR_STYLES,
  hairColor: HAIR_COLORS,
  face: FACES,
  outfit: OUTFITS,
  avatar: AVATARS,
};

const slug = (option: { label: string; id?: string }) => option.id ?? option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Stable item id for an appearance option, e.g. "hair.mohawk", "hairColor.blue". */
export function cosmeticItemId(category: CosmeticCategory, index: number): string {
  const option = OPTIONS[category][index];
  return option ? `${category}.${slug(option)}` : `${category}.unknown`;
}

/** Every cosmetic item id, in catalog order. */
export function allCosmeticItemIds(): { id: string; category: CosmeticCategory; index: number; label: string }[] {
  const items: { id: string; category: CosmeticCategory; index: number; label: string }[] = [];
  for (const category of Object.keys(OPTIONS) as CosmeticCategory[]) {
    OPTIONS[category].forEach((option, index) => items.push({ id: cosmeticItemId(category, index), category, index, label: option.label }));
  }
  return items;
}

/**
 * Free items every player owns: three per category, including the first option so the
 * default look is always valid. Everything else is bought once and owned for good.
 */
export const STARTER_ITEMS: readonly string[] = [
  "hair.topknot",
  "hair.bald",
  "hair.ponytail",
  "hairColor.black",
  "hairColor.brown",
  "hairColor.ginger",
  "face.determined",
  "face.happy",
  "face.wink",
  "outfit.classic",
  "outfit.striped",
  "outfit.polka",
  "avatar.0",
  "avatar.1",
  "avatar.2",
  "avatar.3",
];

/**
 * Cosmetic prices in Sumo Coins. One table for the shop display and the server; the server
 * only ever charges what this table says.
 */
export const COSMETIC_PRICES: Readonly<Record<string, number>> = Object.freeze({
  "hair.spiky": 250,
  "hair.bowl": 150,
  "hair.mohawk": 400,
  "hair.afro": 350,
  "hair.buns": 300,
  "hair.samurai": 600,
  "hairColor.silver": 200,
  "hairColor.blue": 300,
  "hairColor.pink": 250,
  "hairColor.green": 250,
  "hairColor.purple": 300,
  "hairColor.gold": 800,
  "hairColor.white": 400,
  "face.cool": 400,
  "face.sleepy": 100,
  "face.fierce": 300,
  "face.surprised": 150,
  "face.grumpy": 150,
  "face.sparkly": 500,
  "outfit.apron": 750,
  "outfit.champion": 2000,
  "outfit.sagari": 600,
  "outfit.cape": 1200,
  "outfit.armbands": 450,
});

/**
 * Sumo Coin packs for the coin shop. Purchases aren't available yet; the ids are the future
 * product ids for a store integration.
 */
export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  image: string;
  tag?: "Popular" | "Best value";
}

export const COIN_PACKS: readonly CoinPack[] = [
  { id: "coins_500", name: "Lucky coin", coins: 500, image: "coins/pack1.webp" },
  { id: "coins_1200", name: "Coin stack", coins: 1200, image: "coins/pack2.webp" },
  { id: "coins_2600", name: "Lucky pouch", coins: 2600, image: "coins/pack3.webp", tag: "Popular" },
  { id: "coins_5500", name: "Wooden chest", coins: 5500, image: "coins/pack4.webp" },
  { id: "coins_12000", name: "Silver chest", coins: 12000, image: "coins/pack5.webp" },
  { id: "coins_30000", name: "Golden chest", coins: 30000, image: "coins/pack6.webp" },
  { id: "coins_70000", name: "Grand festival", coins: 70000, image: "coins/pack7.webp", tag: "Best value" },
];

/** Avatars past the free four: 250, then 450, 700 and 1,000 coins for the rarer ones. */
function avatarPrice(index: number): number {
  if (index < 12) return 250;
  if (index < 24) return 450;
  if (index < 34) return 700;
  return 1000;
}

/** Price of an item (0 for starter items). */
export function cosmeticPrice(itemId: string): number {
  if (STARTER_ITEMS.includes(itemId)) return 0;
  if (itemId.startsWith("avatar.")) return avatarPrice(Number(itemId.slice(7)));
  return COSMETIC_PRICES[itemId] ?? 500;
}

/** Replaces any option the player doesn't own with the default (index 0). */
export function restrictToOwned(appearance: Appearance, owned: ReadonlySet<string>): Appearance {
  const keep = (category: CosmeticCategory) => (owned.has(cosmeticItemId(category, appearance[category])) ? appearance[category] : 0);
  return { hair: keep("hair"), hairColor: keep("hairColor"), face: keep("face"), outfit: keep("outfit"), avatar: keep("avatar") };
}

// ---------------------------------------------------------------- API shapes

export interface EconomyFlags {
  economy: boolean;
  shop: boolean;
  premiumCurrency: boolean;
  realMoneyPurchases: boolean;
}

export type DrawPolicy = "refund";

export interface ArenaInfo {
  id: string;
  name: string;
  description: string;
  entryFee: number;
  currency: Currency;
  minPlayers: number;
  maxPlayers: number;
  /** Percentage of the entry pool removed from circulation. */
  economyFeePercent: number;
  /** Largest prize the winner can get (full room). */
  maxPrize: number;
  /** Human-readable payout rule. */
  payoutRule: string;
  drawPolicy: DrawPolicy;
  bots: boolean;
  /** Player level needed to enter. */
  requires: { level: number };
  enabled: boolean;
}

export interface ShopItemInfo {
  id: string;
  category: CosmeticCategory;
  index: number;
  name: string;
  price: number;
  currency: Currency;
  starter: boolean;
  available: boolean;
}

export interface CatalogResponse {
  flags: EconomyFlags;
  arenas: ArenaInfo[];
  items: ShopItemInfo[];
}

export interface ProfileResponse {
  accountId: string;
  /** Display name and when the name / look were last changed (ISO time; "" if never). */
  name?: string;
  profileUpdatedAt?: string;
  balances: Record<Currency, number>;
  owned: string[];
  appearance: Appearance;
  stats: {
    matches: number;
    wins: number;
    coinsEarned: number;
    /** Opponents you pushed out of the ring. */
    ringOuts?: number;
    /** Wardrobe items bought. */
    itemsBought?: number;
    bestStreak?: number;
  };
  /** Progression: level from total XP. */
  level: LevelInfo;
  /** Free rewards already earned today (UTC) and the daily cap. */
  daily: { earned: number; cap: number; firstMatchBonusAvailable: boolean };
}

/**
 * The device's copy of the profile, sent when the server is reachable again. Name and look:
 * the newer side wins. XP and play stats: the higher value wins (progress is never lost).
 */
export interface ProfileSyncRequest {
  name: string;
  appearance: Appearance;
  xp: number;
  matches: number;
  wins: number;
  /** When the name / look were last changed on the device (ISO time). */
  updatedAt: string;
}

// ---------------------------------------------------------------- leaderboard

/** One row of the leaderboard: players ranked by total XP. */
export interface LeaderboardEntry {
  rank: number;
  accountId: string;
  name: string;
  avatar: number;
  level: number;
  xp: number;
}

export interface LeaderboardResponse {
  top: LeaderboardEntry[];
  /** Your own row (also when you're not in the top list). */
  you: LeaderboardEntry;
  /** Players on the board. */
  total: number;
}

// ---------------------------------------------------------------- friends

/** A friend (or a pending request) as shown in the friends list. */
export interface FriendEntry {
  accountId: string;
  name: string;
  avatar: number;
  level: number;
  /** Seen by the server in the last minute (the game polls while it's open). */
  online: boolean;
  /** In a room: "in_match" during a bout, "in_lobby" while waiting (with that room's id). */
  activity?: "in_match" | "in_lobby";
  roomId?: string;
}

export interface FriendsResponse {
  /** Your code; friends add you with it. */
  code: string;
  friends: FriendEntry[];
  /** Requests others sent you, and requests you sent. */
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}

export interface FriendProfile extends FriendEntry {
  matches: number;
  wins: number;
  /** Their wrestler's look, to show the character on their profile. */
  appearance: Appearance;
  /** How you're connected (profiles opened from the leaderboard can be anyone's). */
  relation?: "self" | "friend" | "outgoing" | "incoming" | "none";
}

/** An invitation to join a friend's room. */
export interface GameInvite {
  id: string;
  from: { accountId: string; name: string; avatar: number };
  roomId: string;
  createdAt: number;
}

export type LedgerCategory =
  | "welcome"
  | "arena_entry"
  | "arena_refund"
  | "arena_prize"
  | "match_reward"
  | "daily_bonus"
  | "cosmetic_purchase"
  | "daily_gift"
  | "level_up"
  | "coin_purchase"
  | "adjustment";

export interface LedgerEntry {
  id: string;
  currency: Currency;
  amount: number;
  category: LedgerCategory;
  reason: string;
  matchId: string | null;
  itemId: string | null;
  createdAt: string;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
}

/** Personal economy result sent to each player when a round ends or a room is cancelled. */
export interface EconomyResultMessage {
  kind: "settled" | "rewarded" | "refunded" | "cancelled";
  arenaId: string;
  entryFee: number;
  prize: number;
  economyFee: number;
  rewards: number;
  balance: number | null;
  note: string;
  /** XP gained in this bout and the level afterwards (when known). */
  xp?: number;
  level?: number;
  levelUp?: boolean;
  /** Level before this bout and the coins granted for levelling up. */
  previousLevel?: number;
  levelReward?: number;
}

// ---------------------------------------------------------------- rules shared by the
// local (offline) economy and the server. Balancing values live here, in one place.

/** Coins a new player starts with: enough for a first Rookie bout. */
export const STARTING_COINS = 200;

/** Free coins the shop gives once a day. */
export const DAILY_GIFT_COINS = 100;

export const REWARDS = {
  /** Training Arena only (paid arenas pay prizes instead). */
  participation: 5,
  win: 15,
  /** Extra for the first rewarded bout of each day. */
  firstMatchOfDay: 50,
  /** Free coins (the three above) per day. */
  dailyCap: 300,
  /** A bout must last this long to count, and the player must finish it. */
  minMatchDurationMs: 20_000,
} as const;

export interface ArenaDef {
  id: string;
  name: string;
  description: string;
  entryFee: number;
  minPlayers: number;
  maxPlayers: number;
  economyFeePercent: number;
  /** Bots may fill the ring. */
  bots: boolean;
  requiredLevel: number;
  enabled: boolean;
}

export const ARENA_DEFS: readonly ArenaDef[] = [
  { id: "training", name: "Training Arena", description: "Free practice bouts.", entryFee: 0, minPlayers: 2, maxPlayers: 4, economyFeePercent: 0, bots: true, requiredLevel: 1, enabled: true },
  { id: "rookie", name: "Rookie Arena", description: "Low-stakes bouts.", entryFee: 50, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 1, enabled: true },
  { id: "amateur", name: "Amateur Arena", description: "A step up from the rookies.", entryFee: 150, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 3, enabled: true },
  { id: "pro", name: "Pro Arena", description: "Tougher wrestlers, bigger pool.", entryFee: 500, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 5, enabled: true },
  { id: "veteran", name: "Veteran Arena", description: "Seasoned wrestlers and taiko drums.", entryFee: 1000, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 8, enabled: true },
  { id: "champion", name: "Champion Arena", description: "High stakes for proven winners.", entryFee: 2000, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 10, enabled: true },
  { id: "master", name: "Master Arena", description: "The palace ring of the masters.", entryFee: 5000, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 15, enabled: true },
  { id: "legend", name: "Legend Arena", description: "Where legends are made.", entryFee: 10000, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 20, enabled: true },
  { id: "godlike", name: "Godlike Arena", description: "A ring above the clouds.", entryFee: 25000, minPlayers: 2, maxPlayers: 4, economyFeePercent: 10, bots: true, requiredLevel: 30, enabled: true },
];

export function arenaDef(id: unknown): ArenaDef | null {
  return ARENA_DEFS.find((a) => a.id === id) ?? null;
}

/**
 * Prize for a paid bout, in integer coins:
 *   pool = entryFee * players, prize = floor(pool * (100 - fee%) / 100), sink = pool - prize.
 * prize + sink === pool, so rounding never creates coins.
 */
export function computePrize(entryFee: number, players: number, feePercent: number): { pool: number; prize: number; sink: number } {
  if (!Number.isInteger(entryFee) || entryFee < 0 || !Number.isInteger(players) || players < 0) {
    throw new Error("invalid prize input");
  }
  const fee = Math.min(100, Math.max(0, Math.floor(feePercent)));
  const pool = entryFee * players;
  const prize = Math.floor((pool * (100 - fee)) / 100);
  return { pool, prize, sink: pool - prize };
}

export function arenaInfo(arena: ArenaDef): ArenaInfo {
  const full = computePrize(arena.entryFee, arena.maxPlayers, arena.economyFeePercent);
  return {
    id: arena.id,
    name: arena.name,
    description: arena.description,
    entryFee: arena.entryFee,
    currency: Currency.Coins,
    minPlayers: arena.minPlayers,
    maxPlayers: arena.maxPlayers,
    economyFeePercent: arena.economyFeePercent,
    maxPrize: full.prize,
    payoutRule:
      arena.entryFee === 0
        ? "Free practice. No coins, but every finished bout earns XP."
        : `The winner takes the pool minus a ${arena.economyFeePercent}% fee. Draws and bouts that never start are refunded.`,
    drawPolicy: "refund",
    bots: arena.bots,
    requires: { level: arena.requiredLevel },
    enabled: arena.enabled,
  };
}

export function arenaInfos(): ArenaInfo[] {
  return ARENA_DEFS.map(arenaInfo);
}

/**
 * Bot difficulty for arenas where the player doesn't pick it: random, weighted by tier.
 * (Training uses the player's own choice.)
 */
export function botLevelForArena(arenaId: string, random: () => number = Math.random): "easy" | "normal" | "hard" {
  const r = random();
  if (arenaId === "rookie") return r < 0.5 ? "easy" : "normal";
  if (arenaId === "amateur") return r < 0.25 ? "easy" : "normal";
  if (arenaId === "pro") return r < 0.6 ? "normal" : "hard";
  if (arenaId === "veteran") return r < 0.45 ? "normal" : "hard";
  if (arenaId === "champion") return r < 0.3 ? "normal" : "hard";
  if (arenaId === "master" || arenaId === "legend" || arenaId === "godlike") return r < 0.1 ? "normal" : "hard";
  return "normal";
}

// ---------------------------------------------------------------- levels

export interface LevelInfo {
  level: number;
  /** Total XP. */
  xp: number;
  /** XP at the start of this level and needed for the next one. */
  levelStartXp: number;
  nextLevelXp: number;
}

/** Total XP needed to reach a level: 50 * (level - 1) * level  (L2 = 100, L5 = 1000, L10 = 4500). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 50 * (l - 1) * l;
}

export function levelFromXp(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpForLevel(level + 1) <= total && level < 999) level++;
  return { level, xp: total, levelStartXp: xpForLevel(level), nextLevelXp: xpForLevel(level + 1) };
}

/** Coins for reaching a level: 50 + 25 per level (level 2 = 100, level 5 = 175, level 10 = 300). */
export function levelUpReward(level: number): number {
  return level <= 1 ? 0 : 50 + 25 * Math.floor(level);
}

/** Total level-up coins for going from one level to another (several at once add up). */
export function levelUpCoins(fromLevel: number, toLevel: number): number {
  let total = 0;
  for (let l = Math.floor(fromLevel) + 1; l <= Math.floor(toLevel); l++) total += levelUpReward(l);
  return total;
}

const XP_ARENA_MULTIPLIER: Record<string, number> = {
  training: 1,
  rookie: 1.5,
  amateur: 1.75,
  pro: 2,
  veteran: 2.5,
  champion: 3,
  master: 4,
  legend: 5,
  godlike: 6,
};

/** XP for a finished bout: 20 for taking part, +30 for a win, scaled by arena tier. */
export function xpForMatch(arenaId: string, won: boolean, completed: boolean): number {
  if (!completed) return 0;
  return Math.round((20 + (won ? 30 : 0)) * (XP_ARENA_MULTIPLIER[arenaId] ?? 1));
}
