import type { FriendsResponse, LeaderboardResponse } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { createStore } from "../store";

/**
 * Dev mode only: sample data the leaderboard, friends list and coin shop show instead of the
 * server's (or Cafe Bazaar's), so their layout can be checked without a server or a phone.
 * Each is set by its dev panel button and cleared when that panel closes.
 */
export interface DevSamples {
  leaderboard: LeaderboardResponse | null;
  friends: FriendsResponse | null;
  /** Coin pack prices as Cafe Bazaar would show them (the shop's BUY buttons). */
  storePrices: Record<string, string> | null;
}

export const devSamples = createStore<DevSamples>({ leaderboard: null, friends: null, storePrices: null });

const NAMES = ["Neda", "Arash", "Kaveh", "Kenta", "Luca", "Aiko", "Mateo", "Babak", "Sara", "Hiro", "Daichi Takahashi", "Mina"];

export function sampleLeaderboard(): LeaderboardResponse {
  const top = NAMES.map((name, i) => ({
    rank: i + 1,
    accountId: `sample-${i}`,
    name,
    avatar: (i * 3) % 12,
    level: 18 - Math.floor(i / 2),
    xp: 15_757 - i * 1_180,
  }));
  return { top, you: { rank: 22, accountId: "sample-you", name: settingsStore.get().name || "Wrestler", avatar: 0, level: 1, xp: 0 }, total: 40 };
}

export function sampleFriends(): FriendsResponse {
  const friend = (i: number, name: string, online: boolean, activity?: "in_match" | "in_lobby") => ({
    accountId: `sample-f${i}`,
    name,
    avatar: (i * 5) % 12,
    level: 3 + i * 2,
    online,
    ...(activity ? { activity } : {}),
  });
  return {
    code: "QETNTV",
    friends: [friend(1, "Sakura", true), friend(2, "Daichi Takahashi", true, "in_match"), friend(3, "Arash", false)],
    incoming: [friend(4, "Hiro", true)],
    outgoing: [friend(5, "Mina", false)],
  };
}

/** Prices in the form Cafe Bazaar returns them. */
export function sampleStorePrices(): Record<string, string> {
  return {
    coins_500: "۱۹٬۰۰۰ تومان",
    coins_1200: "۳۹٬۰۰۰ تومان",
    coins_2600: "۷۹٬۰۰۰ تومان",
    coins_5500: "۱۵۹٬۰۰۰ تومان",
    coins_12000: "۲۹۹٬۰۰۰ تومان",
    coins_30000: "۶۹۹٬۰۰۰ تومان",
    coins_70000: "۱٬۴۹۰٬۰۰۰ تومان",
  };
}
