import {
  ARENA_DEFS,
  REWARDS,
  STARTER_ITEMS,
  STARTING_COINS,
  allCosmeticItemIds,
  arenaDef,
  arenaInfo,
  cosmeticPrice,
  Currency,
  type ArenaDef,
  type ArenaInfo,
  type EconomyFlags,
} from "@mini-sumo/shared";

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
  welcomeCoins: STARTING_COINS,
  rewards: REWARDS,
  /** Paid arenas: start this long after a second player joins (or at once when full). */
  paidStartDelayMs: 12_000,
  /** Paid arenas: cancel and refund when no opponent arrives in time. */
  paidCancelAfterMs: 60_000,
} as const;

/**
 * Arenas come from packages/shared (ARENA_DEFS), the same table the offline economy uses.
 * Online, paid arenas are humans only: a prize must come from other players' entries.
 */
export type ArenaConfig = ArenaDef;

/** Private rooms: free, no rewards (friends could otherwise farm coins together). */
export const PRIVATE_ARENA_ID = "private";

export function getArena(id: unknown): ArenaConfig | null {
  return arenaDef(id);
}

export function listArenas(): ArenaInfo[] {
  return ARENA_DEFS.map((arena) => ({ ...arenaInfo(arena), bots: arena.entryFee === 0 }));
}

/** Cosmetic prices live in packages/shared (COSMETIC_PRICES); starter items are free. */
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
    price: cosmeticPrice(item.id),
    currency: Currency.Coins,
    starter,
    available: true,
  };
});

export function getItem(id: unknown): ItemConfig | null {
  return typeof id === "string" ? (CATALOG.find((item) => item.id === id) ?? null) : null;
}
