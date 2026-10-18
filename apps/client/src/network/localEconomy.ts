import {
  Currency,
  REWARDS,
  DAILY_GIFT_COINS,
  STARTER_ITEMS,
  STARTING_COINS,
  allCosmeticItemIds,
  arenaDef,
  arenaInfos,
  computePrize,
  cosmeticPrice,
  levelFromXp,
  levelUpCoins,
  xpForMatch,
  type CatalogResponse,
  type EconomyResultMessage,
  type LedgerCategory,
  type LedgerEntry,
  type ProfileResponse,
} from "@mini-sumo/shared";
import { settingsStore } from "../settings";

/**
 * On-device economy for the offline game: the same rules as the server (shared package),
 * stored in localStorage. Single-player only; when online play arrives the server becomes
 * the authority again.
 */

const KEY = "mini-sumo:local-economy";
const MAX_LEDGER = 200;

interface LocalState {
  v: 1;
  coins: number;
  xp: number;
  matches: number;
  wins: number;
  coinsEarned: number;
  owned: string[];
  ledger: LedgerEntry[];
  rewardDay: string;
  rewardDayTotal: number;
  bonusDay: string;
  /** Opponents pushed out, current and best win streak. */
  ringOuts: number;
  streak: number;
  bestStreak: number;
  /** Day the shop's free daily coins were last claimed. */
  giftDay: string;
  /** Store purchases already credited (purchase tokens), so a purchase is never credited twice. */
  purchases: string[];
}

export interface LocalEntry {
  id: string;
  arenaId: string;
  fee: number;
  status: "paid" | "locked" | "done";
}

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function fresh(): LocalState {
  return {
    v: 1,
    coins: STARTING_COINS,
    xp: 0,
    matches: 0,
    wins: 0,
    coinsEarned: 0,
    owned: [],
    ledger: [
      {
        id: uid(),
        currency: Currency.Coins,
        amount: STARTING_COINS,
        category: "welcome",
        reason: "Welcome gift",
        matchId: null,
        itemId: null,
        createdAt: new Date().toISOString(),
      },
    ],
    rewardDay: "",
    rewardDayTotal: 0,
    bonusDay: "",
    ringOuts: 0,
    streak: 0,
    bestStreak: 0,
    giftDay: "",
    purchases: [],
  };
}

function load(): LocalState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalState>;
      if (parsed && parsed.v === 1 && Number.isInteger(parsed.coins)) return { ...fresh(), ...parsed, coins: Math.max(0, parsed.coins!) };
    }
  } catch {
    // corrupted or unavailable storage: start fresh
  }
  return fresh();
}

let state = load();

function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable: progress lasts for this session
  }
}

function record(amount: number, category: LedgerCategory, reason: string, extra: { matchId?: string; itemId?: string } = {}): void {
  state.coins = Math.max(0, state.coins + amount);
  state.ledger.unshift({
    id: uid(),
    currency: Currency.Coins,
    amount,
    category,
    reason,
    matchId: extra.matchId ?? null,
    itemId: extra.itemId ?? null,
    createdAt: new Date().toISOString(),
  });
  state.ledger.length = Math.min(state.ledger.length, MAX_LEDGER);
}

/** Everything a cloud save needs: the wallet, progress and ownership. */
export type LocalSnapshot = LocalState;

export const localEconomy = {
  exportState(): LocalSnapshot {
    return JSON.parse(JSON.stringify(state)) as LocalSnapshot;
  },

  /** Replaces the on-device progress (e.g. restored from Google Play). */
  importState(snapshot: unknown): boolean {
    const s = snapshot as Partial<LocalState> | null;
    if (!s || s.v !== 1 || !Number.isInteger(s.coins) || !Number.isFinite(s.xp)) return false;
    state = { ...fresh(), ...s, coins: Math.max(0, s.coins!), ledger: Array.isArray(s.ledger) ? s.ledger.slice(0, MAX_LEDGER) : [] };
    save();
    return true;
  },

  catalog(): CatalogResponse {
    return {
      flags: { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false },
      arenas: arenaInfos(),
      items: allCosmeticItemIds().map((item) => ({
        id: item.id,
        category: item.category,
        index: item.index,
        name: item.label,
        price: cosmeticPrice(item.id),
        currency: Currency.Coins,
        starter: STARTER_ITEMS.includes(item.id),
        available: true,
      })),
    };
  },

  profile(): ProfileResponse {
    const day = today();
    return {
      accountId: "local",
      balances: { coins: state.coins, gems: 0 },
      owned: [...new Set([...STARTER_ITEMS, ...state.owned])],
      appearance: settingsStore.get().appearance,
      stats: {
        matches: state.matches,
        wins: state.wins,
        coinsEarned: state.coinsEarned,
        ringOuts: state.ringOuts,
        itemsBought: state.owned.length,
        bestStreak: state.bestStreak,
      },
      level: levelFromXp(state.xp),
      daily: {
        earned: state.rewardDay === day ? state.rewardDayTotal : 0,
        cap: REWARDS.dailyCap,
        firstMatchBonusAvailable: state.bonusDay !== day,
      },
    };
  },

  ledger(): LedgerEntry[] {
    return [...state.ledger];
  },

  /** The shop's free coins: once per (UTC) day. */
  dailyGiftAvailable(): boolean {
    return state.giftDay !== today();
  },

  /**
   * Credits a coin pack bought in the store. Idempotent per purchase token: returns false if
   * this purchase was already credited (e.g. found again when restoring unfinished purchases).
   */
  creditCoinPurchase(purchaseToken: string, coins: number, label: string): boolean {
    if (!purchaseToken || state.purchases.includes(purchaseToken)) return false;
    record(coins, "coin_purchase", `Bought ${label}`);
    state.purchases.push(purchaseToken);
    if (state.purchases.length > 500) state.purchases.splice(0, state.purchases.length - 500);
    save();
    return true;
  },

  // ------------------------------------------------------------- profile sync

  /** XP and play stats on this device (sent to the server when it's reachable). */
  progress(): { xp: number; matches: number; wins: number } {
    return { xp: state.xp, matches: state.matches, wins: state.wins };
  },

  /** Takes the server's progress where it's higher (never lowers what's on the device). */
  mergeProgress(server: { xp: number; matches: number; wins: number }): void {
    const xp = Math.max(state.xp, Math.floor(server.xp) || 0);
    const matches = Math.max(state.matches, Math.floor(server.matches) || 0);
    const wins = Math.max(state.wins, Math.floor(server.wins) || 0);
    if (xp === state.xp && matches === state.matches && wins === state.wins) return;
    state.xp = xp;
    state.matches = matches;
    state.wins = wins;
    save();
  },

  // ------------------------------------------------------------- dev tools

  /** Dev mode: add (or remove) coins. */
  devAddCoins(coins: number): void {
    record(coins, "adjustment", "Dev mode");
    save();
  },

  /** Dev mode: add XP; returns the levels before and after. */
  devAddXp(xp: number): { from: number; to: number } {
    const from = levelFromXp(state.xp).level;
    state.xp = Math.max(0, state.xp + xp);
    save();
    return { from, to: levelFromXp(state.xp).level };
  },

  /** Dev mode: the daily coins can be claimed again. */
  devResetDailyGift(): void {
    state.giftDay = "";
    save();
  },

  claimDailyGift(): number {
    if (state.giftDay === today()) return 0;
    state.giftDay = today();
    record(DAILY_GIFT_COINS, "daily_gift", "Daily coins");
    save();
    return DAILY_GIFT_COINS;
  },

  /** Buys a cosmetic once; already owned items are never charged again. */
  purchase(itemId: string): void {
    const item = allCosmeticItemIds().find((i) => i.id === itemId);
    if (!item) throw new Error("That item doesn't exist.");
    if (STARTER_ITEMS.includes(itemId) || state.owned.includes(itemId)) return;
    const price = cosmeticPrice(itemId);
    if (state.coins < price) throw new Error("Not enough Sumo Coins.");
    record(-price, "cosmetic_purchase", `Bought ${item.label}`, { itemId });
    state.owned.push(itemId);
    save();
  },

  canEnter(arenaId: string): { ok: true } | { ok: false; error: string } {
    const arena = arenaDef(arenaId);
    if (!arena || !arena.enabled) return { ok: false, error: "That arena is not available." };
    if (levelFromXp(state.xp).level < arena.requiredLevel) return { ok: false, error: `${arena.name} unlocks at level ${arena.requiredLevel}.` };
    if (state.coins < arena.entryFee) return { ok: false, error: `You need ${arena.entryFee} Sumo Coins to enter ${arena.name}.` };
    return { ok: true };
  },

  /** Pays the entry fee. Free arenas return an entry with fee 0. */
  payEntry(arenaId: string): LocalEntry {
    const check = this.canEnter(arenaId);
    if (!check.ok) throw new Error(check.error);
    const arena = arenaDef(arenaId)!;
    if (arena.entryFee > 0) record(-arena.entryFee, "arena_entry", `${arena.name} entry`);
    save();
    return { id: uid(), arenaId, fee: arena.entryFee, status: "paid" };
  },

  /** Leaving before the bout starts gives the fee back (once). */
  refundIfNotStarted(entry: LocalEntry, reason = "Left before the bout started"): void {
    if (entry.status !== "paid") return;
    entry.status = "done";
    if (entry.fee > 0) {
      record(entry.fee, "arena_refund", reason);
      save();
    }
  },

  lock(entry: LocalEntry): void {
    if (entry.status === "paid") entry.status = "locked";
  },

  /**
   * Finishes a bout once: prize or refund for paid arenas, free rewards for training,
   * XP and stats for both.
   */
  finish(
    entry: LocalEntry,
    result: { matchId: string; won: boolean; draw: boolean; completed: boolean; durationMs: number; players: number; ringOuts?: number },
  ): EconomyResultMessage {
    const arena = arenaDef(entry.arenaId);
    const base: EconomyResultMessage = {
      kind: entry.fee > 0 ? "settled" : "rewarded",
      arenaId: entry.arenaId,
      entryFee: entry.fee,
      prize: 0,
      economyFee: 0,
      rewards: 0,
      balance: state.coins,
      note: "",
    };
    if (entry.status === "done" || !arena) return base;
    entry.status = "done";
    const levelBefore = levelFromXp(state.xp).level;

    // Paid arenas: prize from the pool, or refund on a draw.
    if (entry.fee > 0) {
      if (result.draw) {
        record(entry.fee, "arena_refund", "Draw: entry refunded", { matchId: result.matchId });
        base.kind = "refunded";
        base.note = "No single winner: your entry fee was refunded.";
      } else {
        const { prize, sink } = computePrize(entry.fee, Math.max(1, result.players), arena.economyFeePercent);
        base.economyFee = sink;
        if (result.won && prize > 0) {
          record(prize, "arena_prize", `${arena.name} win`, { matchId: result.matchId });
          state.coinsEarned += prize;
          base.prize = prize;
          base.note = "You won the pool!";
        } else {
          base.note = "Entry fee spent. Better luck next bout!";
        }
      }
    }

    // Stats and XP for every bout you finish (the minimum bout length only guards coin rewards).
    const counts = result.completed;
    if (counts) {
      state.matches += 1;
      state.ringOuts += Math.max(0, result.ringOuts ?? 0);
      if (result.won) {
        state.wins += 1;
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
      } else {
        state.streak = 0;
      }
      const xp = xpForMatch(entry.arenaId, result.won, true);
      state.xp += xp;
      base.xp = xp;
    }
    // Training is practice: XP only, no coin rewards.
    save();
    base.balance = state.coins;
    base.level = levelFromXp(state.xp).level;
    base.levelUp = base.level > levelBefore;
    base.previousLevel = levelBefore;
    if (base.levelUp) {
      // Coins for every level reached.
      const coins = levelUpCoins(levelBefore, base.level);
      if (coins > 0) {
        record(coins, "level_up", `Reached level ${base.level}`, { matchId: result.matchId });
        state.coinsEarned += coins;
        base.levelReward = coins;
        save();
        base.balance = state.coins;
      }
    }
    return base;
  },

};
