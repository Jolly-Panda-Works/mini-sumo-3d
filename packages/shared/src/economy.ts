import { FACES, HAIR_COLORS, HAIR_STYLES, OUTFITS, type Appearance } from "./appearance.js";

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
 * Free items every player owns, also offline: the first option of each category, so the
 * default look is always valid. Everything else is bought once and owned for good.
 */
export const STARTER_ITEMS: readonly string[] = ["hair.topknot", "hairColor.black", "face.determined", "outfit.classic"];

/**
 * Cosmetic prices in Sumo Coins. One table for the shop display and the server; the server
 * only ever charges what this table says.
 */
export const COSMETIC_PRICES: Readonly<Record<string, number>> = Object.freeze({
  "hair.bald": 100,
  "hair.spiky": 250,
  "hair.bowl": 150,
  "hair.mohawk": 400,
  "hair.ponytail": 200,
  "hair.afro": 350,
  "hair.buns": 300,
  "hair.samurai": 600,
  "hairColor.brown": 50,
  "hairColor.ginger": 150,
  "hairColor.silver": 200,
  "hairColor.blue": 300,
  "hairColor.pink": 250,
  "hairColor.green": 250,
  "hairColor.purple": 300,
  "hairColor.gold": 800,
  "hairColor.white": 400,
  "face.happy": 50,
  "face.cool": 400,
  "face.sleepy": 100,
  "face.fierce": 300,
  "face.wink": 200,
  "face.surprised": 150,
  "face.grumpy": 150,
  "face.sparkly": 500,
  "outfit.striped": 300,
  "outfit.apron": 750,
  "outfit.champion": 2000,
  "outfit.polka": 350,
  "outfit.sagari": 600,
  "outfit.cape": 1200,
  "outfit.armbands": 450,
});

/** Price of an item (0 for starter items). */
export function cosmeticPrice(itemId: string): number {
  return STARTER_ITEMS.includes(itemId) ? 0 : (COSMETIC_PRICES[itemId] ?? 500);
}

/** Replaces any option the player doesn't own with the default (index 0). */
export function restrictToOwned(appearance: Appearance, owned: ReadonlySet<string>): Appearance {
  const keep = (category: CosmeticCategory) => (owned.has(cosmeticItemId(category, appearance[category])) ? appearance[category] : 0);
  return { hair: keep("hair"), hairColor: keep("hairColor"), face: keep("face"), outfit: keep("outfit") };
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
  requires: { matches: number; wins: number };
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
  balances: Record<Currency, number>;
  owned: string[];
  appearance: Appearance;
  stats: { matches: number; wins: number };
  /** Free rewards already earned today (UTC) and the daily cap. */
  daily: { earned: number; cap: number; firstMatchBonusAvailable: boolean };
}

export type LedgerCategory =
  | "welcome"
  | "arena_entry"
  | "arena_refund"
  | "arena_prize"
  | "match_reward"
  | "daily_bonus"
  | "cosmetic_purchase"
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
}
