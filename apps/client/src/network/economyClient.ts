import {
  STARTER_ITEMS,
  restrictToOwned,
  type CatalogResponse,
  type EconomyResultMessage,
  type LedgerEntry,
  type LedgerResponse,
  type ProfileResponse,
} from "@mini-sumo/shared";
import { resolveServerUrl } from "../config";
import { settingsStore } from "../settings";
import { createStore } from "../store";
import { httpUrlFor, networkStore } from "./networkMode";
import { localEconomy } from "./localEconomy";

/** True when the economy runs on this device (no online server). */
const isLocal = () => networkStore.get().mode !== "online";

/**
 * Client side of the economy. The server is the only authority for balances, prices and
 * ownership; this module just calls the API and caches results for display.
 *
 * Identity: a device-bound guest account. The token is a credential (kept in localStorage);
 * no balance or ownership is ever stored locally as truth.
 */

const ACCOUNT_KEY = "mini-sumo:account";
const OWNED_CACHE_KEY = "mini-sumo:owned-cache";

export interface EconomyState {
  status: "offline" | "loading" | "ready" | "error";
  catalog: CatalogResponse | null;
  profile: ProfileResponse | null;
  ledger: LedgerEntry[];
  /** Personal result of the last finished or cancelled arena bout. */
  lastResult: EconomyResultMessage | null;
  error: string | null;
}

export const economyStore = createStore<EconomyState>({
  status: "offline",
  catalog: null,
  profile: null,
  ledger: [],
  lastResult: null,
  error: null,
});

const apiBase = () => `${httpUrlFor(resolveServerUrl())}/api`;

function readAccount(): { accountId: string; token: string } | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    const parsed = raw ? (JSON.parse(raw) as { accountId?: unknown; token?: unknown }) : null;
    return parsed && typeof parsed.token === "string" && typeof parsed.accountId === "string"
      ? { accountId: parsed.accountId, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

function writeAccount(account: { accountId: string; token: string } | null): void {
  try {
    if (account) window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Without storage the guest account lasts for this session only.
  }
}

/** This device's account (id and key), if it has one. */
export function storedAccount(): { accountId: string; token: string } | null {
  return readAccount();
}

/**
 * Switches this device to another account (restored with an email or from Google Play),
 * then restarts the game so everything loads for that player.
 */
export function adoptAccount(account: { accountId: string; token: string }): void {
  writeAccount(account);
  window.location.reload();
}

/** Display cache of owned items, used only to dress up offline. Never used by the server. */
export function cachedOwnedItems(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OWNED_CACHE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set([...STARTER_ITEMS, ...(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [])]);
  } catch {
    return new Set(STARTER_ITEMS);
  }
}

/** Items the player may wear right now: server ownership online, starter + cache offline. */
export function ownedItems(): Set<string> {
  const profile = economyStore.get().profile;
  return profile ? new Set(profile.owned) : cachedOwnedItems();
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${(await ensureAccount()).token}`;
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers, cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(response.status, String(body.error ?? "error"), String(body.message ?? "Something went wrong. Try again."));
  }
  return body as T;
}

let accountPromise: Promise<{ accountId: string; token: string }> | null = null;

/** Returns this device's guest account, creating one on first use. */
export function ensureAccount(): Promise<{ accountId: string; token: string }> {
  const existing = readAccount();
  if (existing) return Promise.resolve(existing);
  accountPromise ??= request<{ accountId: string; token: string }>("/guest", { method: "POST" }, false)
    .then((account) => {
      writeAccount(account);
      return account;
    })
    .finally(() => {
      accountPromise = null;
    });
  return accountPromise;
}

export function accountToken(): string | undefined {
  return readAccount()?.token;
}

function applyProfile(profile: ProfileResponse): void {
  economyStore.update({ profile, status: "ready", error: null });
  // Online: keep the device's copy of the progress up to date (used when offline).
  if (!isLocal()) localEconomy.mergeProgress({ xp: profile.level.xp, matches: profile.stats.matches, wins: profile.stats.wins });
  try {
    window.localStorage.setItem(OWNED_CACHE_KEY, JSON.stringify(profile.owned));
  } catch {
    // display cache only
  }
  // Never wear something the server says we don't own.
  const owned = new Set(profile.owned);
  const current = settingsStore.get().appearance;
  const allowed = restrictToOwned(current, owned);
  if (JSON.stringify(allowed) !== JSON.stringify(current)) settingsStore.update({ appearance: allowed });
}

/** Loads catalog and profile (online mode). Recreates the guest account if the server lost it. */
/** Offline: the on-device economy (same rules as the server). */
export function initLocalEconomy(): void {
  economyStore.update({ catalog: localEconomy.catalog(), status: "ready", error: null });
  applyProfile(localEconomy.profile());
}

export function applyServerProfile(profile: ProfileResponse): void {
  applyProfile(profile);
}

export async function loadEconomy(): Promise<void> {
  economyStore.update({ status: "loading", error: null });
  try {
    const catalog = await request<CatalogResponse>("/catalog", {}, false);
    economyStore.update({ catalog });
    if (!catalog.flags.economy) {
      economyStore.update({ status: "offline" });
      return;
    }
    try {
      applyProfile(await request<ProfileResponse>("/profile"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        writeAccount(null);
        applyProfile(await request<ProfileResponse>("/profile"));
      } else {
        throw error;
      }
    }
  } catch (error) {
    economyStore.update({ status: "error", error: error instanceof Error ? error.message : "Couldn't load your wallet." });
  }
}

export async function refreshProfile(): Promise<void> {
  if (isLocal()) {
    applyProfile(localEconomy.profile());
    return;
  }
  if (economyStore.get().status === "offline") return;
  try {
    applyProfile(await request<ProfileResponse>("/profile"));
  } catch {
    // keep the last known profile
  }
}

export async function loadLedger(): Promise<void> {
  if (isLocal()) {
    economyStore.update({ ledger: localEconomy.ledger() });
    return;
  }
  try {
    const { entries } = await request<LedgerResponse>("/ledger?limit=100");
    economyStore.update({ ledger: entries });
  } catch (error) {
    economyStore.update({ error: error instanceof Error ? error.message : "Couldn't load your history." });
  }
}

const pendingPurchases = new Map<string, Promise<void>>();

/**
 * Buys a cosmetic. One request per item at a time, and the same idempotency key for a retry
 * of the same click, so a double tap or a network retry never charges twice.
 */
export function buyItem(itemId: string): Promise<void> {
  if (isLocal()) {
    try {
      localEconomy.purchase(itemId);
      applyProfile(localEconomy.profile());
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const pending = pendingPurchases.get(itemId);
  if (pending) return pending;
  const idempotencyKey = crypto.randomUUID();
  const attempt = request<{ profile: ProfileResponse }>("/shop/purchase", {
    method: "POST",
    body: JSON.stringify({ itemId, idempotencyKey }),
  })
    .then(({ profile }) => applyProfile(profile))
    .finally(() => pendingPurchases.delete(itemId));
  pendingPurchases.set(itemId, attempt);
  return attempt;
}

export async function saveAppearanceRemote(): Promise<void> {
  if (isLocal()) return;
  if (economyStore.get().status !== "ready") return;
  try {
    await request("/profile/appearance", { method: "PUT", body: JSON.stringify(settingsStore.get().appearance) });
  } catch {
    // the next join sends the look again
  }
}

export function setLastResult(result: EconomyResultMessage | null): void {
  economyStore.update({ lastResult: result });
}
