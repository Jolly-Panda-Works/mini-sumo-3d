import { STARTER_ITEMS, allCosmeticItemIds, Currency, type ArenaInfo, type EconomyFlags } from "@mini-sumo/shared";
import { computePrize } from "./prize.js";

/**
 * Authoritative economy configuration. Every price, fee and reward lives here; the client
 * only receives the public view through /api/catalog. Values are balancing examples.
 */

const envFlag = (name: string, fallback: boolean): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
};

/**
 * Feature flags (server-enforced). Premium currency and real-money purchases stay off:
 * no payment provider is configured, so even setting them to true can't enable checkout.
 */
export function loadFlags(): EconomyFlags {
  return {
    economy: envFlag("ECONOMY_ENABLED", true),
    shop: envFlag("SHOP_ENABLED", true),
    premiumCurrency: envFlag("PREMIUM_CURRENCY_ENABLED", false),
    realMoneyPurchases: envFlag("REAL_MONEY_PURCHASES_ENABLED", false),
  };
}

export const ECONOMY = {
  /** Coins granted once when a guest account is created. */
  welcomeCoins: 500,

  rewards: {
    /** Free rewards are only given in the training arena (paid arenas pay prizes instead). */
    participation: 5,
    win: 15,
    /** Extra once per UTC day for the first completed rewarded match. */
    firstMatchOfDay: 50,
    /** Cap on free rewards (participation + win + daily bonus) per account per UTC day. */
    dailyCap: 300,
    /** A round must last this long to count, and the player must not have left it. */
    minMatchDurationMs: 20_000,
  },

  /** Paid arenas: start this long after a second player joins (or at once when full). */
  paidStartDelayMs: 12_000,
  /** Paid arenas: cancel and refund when no opponent arrives in time. */
  paidCancelAfterMs: 60_000,
} as const;

interface ArenaConfig {
  id: string;
  name: string;
  description: string;
  entryFee: number;
  minPlayers: number;
  maxPlayers: number;
  economyFeePercent: number;
  /** Bots only in free arenas: paid prizes must come from human entries. */
  bots: boolean;
  requires: { matches: number; wins: number };
  enabled: boolean;
}

const ARENA_CONFIG: readonly ArenaConfig[] = [
  {
    id: "training",
    name: "Training Arena",
    description: "Free practice. Earn a few coins per bout; bots fill in if nobody joins.",
    entryFee: 0,
    minPlayers: 2,
    maxPlayers: 4,
    economyFeePercent: 0,
    bots: true,
    requires: { matches: 0, wins: 0 },
    enabled: true,
  },
  {
    id: "rookie",
    name: "Rookie Arena",
    description: "Low-stakes bouts against other players.",
    entryFee: 100,
    minPlayers: 2,
    maxPlayers: 4,
    economyFeePercent: 10,
    bots: false,
    requires: { matches: 0, wins: 0 },
    enabled: true,
  },
  {
    id: "pro",
    name: "Pro Arena",
    description: "For wrestlers with a few bouts behind them.",
    entryFee: 500,
    minPlayers: 2,
    maxPlayers: 4,
    economyFeePercent: 10,
    bots: false,
    requires: { matches: 10, wins: 0 },
    enabled: true,
  },
  {
    id: "champion",
    name: "Champion Arena",
    description: "High-stakes bouts for proven winners.",
    entryFee: 2000,
    minPlayers: 2,
    maxPlayers: 4,
    economyFeePercent: 10,
    bots: false,
    requires: { matches: 20, wins: 10 },
    enabled: true,
  },
];

/** Private rooms: free, no rewards (friends could otherwise farm coins together). */
export const PRIVATE_ARENA_ID = "private";

export function getArena(id: unknown): ArenaConfig | null {
  return ARENA_CONFIG.find((a) => a.id === id) ?? null;
}

export function arenaInfo(arena: ArenaConfig): ArenaInfo {
  const full = computePrize(arena.entryFee, arena.maxPlayers, arena.economyFeePercent);
  return {
    ...arena,
    currency: Currency.Coins,
    maxPrize: full.prize,
    payoutRule:
      arena.entryFee === 0
        ? `Free. +${ECONOMY.rewards.participation} coins per finished bout, +${ECONOMY.rewards.win} for a win (daily cap ${ECONOMY.rewards.dailyCap}).`
        : `Winner takes the pool minus a ${arena.economyFeePercent}% economy fee. Draws and cancelled matches are refunded.`,
    drawPolicy: "refund",
  };
}

export function listArenas(): ArenaInfo[] {
  return ARENA_CONFIG.map(arenaInfo);
}

export type { ArenaConfig };

/** Cosmetic prices in Sumo Coins. Starter items are free and owned by everyone. */
const ITEM_PRICES: Record<string, number> = {
  "hair.spiky": 250,
  "hair.bowl": 150,
  "hair.mohawk": 400,
  "hairColor.ginger": 150,
  "hairColor.silver": 200,
  "hairColor.blue": 300,
  "face.cool": 400,
  "face.sleepy": 100,
  "face.fierce": 300,
  "outfit.striped": 300,
  "outfit.apron": 750,
  "outfit.champion": 2000,
};

export interface ItemConfig {
  id: string;
  category: ReturnType<typeof allCosmeticItemIds>[number]["category"];
  index: number;
  name: string;
  price: number;
  currency: Currency;
  starter: boolean;
  available: boolean;
}

export const CATALOG: readonly ItemConfig[] = allCosmeticItemIds().map((item) => {
  const starter = STARTER_ITEMS.includes(item.id);
  return {
    id: item.id,
    category: item.category,
    index: item.index,
    name: item.label,
    price: starter ? 0 : (ITEM_PRICES[item.id] ?? 500),
    currency: Currency.Coins,
    starter,
    available: true,
  };
});

export function getItem(id: unknown): ItemConfig | null {
  return typeof id === "string" ? (CATALOG.find((item) => item.id === id) ?? null) : null;
}
