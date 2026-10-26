import { createStore } from "../store";
import { settingsStore } from "../settings";
import { pushToast, showMessage } from "../uiStore";
import { economyStore } from "./economyClient";
import { cloudSnapshot, restoreCloudSave } from "./cloudSave";

/**
 * Cafe Bazaar features of the Bazaar build (VITE_STORE=bazaar), through the native Bazaar
 * plugin (apps/mobile/native/BazaarPlugin.kt):
 * - sign in with Bazaar, with the save kept in Bazaar's in-app storage (10 KB per player):
 *   it holds the game server account, so a new or reset phone plays as the same player.
 *   This replaces saving with an email in this build.
 * - Bazaar's pages: rate and review the game, the developer's other games, the update page.
 * - updates: whether Bazaar has a newer version, the in-app update, and auto-update.
 */
type Page = "details" | "review" | "developer" | "update" | "login";

interface BazaarAppNative {
  status(): Promise<{ installed: boolean; needsUpdate: boolean }>;
  showInstallBazaar(): Promise<void>;
  showUpdateBazaar(): Promise<void>;
  account(): Promise<{ accountId: string | null }>;
  signIn(): Promise<{ accountId: string | null }>;
  loadData(): Promise<{ data: string }>;
  saveData(options: { data: string }): Promise<void>;
  isLoggedIn(): Promise<{ loggedIn: boolean | null }>;
  open(options: { page: Page; developerId?: string }): Promise<{ bazaar: boolean }>;
  updateState(): Promise<{ state: "updated" | "needUpdate" | "error"; versionCode?: number; message?: string }>;
  update(): Promise<void>;
  autoUpdateState(): Promise<{ state: "enabled" | "disabled" | "unsupported" }>;
  enableAutoUpdate(): Promise<void>;
}

/** Bazaar's in-app storage holds 10 KB per player; keep a little room. */
const STORAGE_LIMIT = 9_500;
/** The player logged out of Bazaar in the game: no automatic sign-in until they sign in again. */
const OFF_KEY = "mini-sumo:bazaar-login-off";
const DEVELOPER_ID = String(import.meta.env.VITE_BAZAAR_DEVELOPER_ID ?? "").trim();

function findPlugin(): BazaarAppNative | null {
  if (import.meta.env.VITE_STORE !== "bazaar") return null;
  const cap = (window as unknown as { Capacitor?: { isPluginAvailable?(name: string): boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isPluginAvailable?.("Bazaar")) return null;
  const plugin = cap.Plugins?.Bazaar as Partial<BazaarAppNative> | undefined;
  // Builds from before these features have the billing methods only.
  return plugin && typeof plugin.signIn === "function" ? (plugin as BazaarAppNative) : null;
}

const plugin = findPlugin();

/** True in the Bazaar build on a device (its sign-in, pages and updates are available). */
export const bazaarAppAvailable = (): boolean => plugin !== null;

export const bazaarLoginStore = createStore<{ status: "signedOut" | "working" | "connected" }>({ status: "signedOut" });

const loggedOut = (): boolean => {
  try {
    return window.localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
};
const setLoggedOut = (off: boolean): void => {
  try {
    if (off) window.localStorage.setItem(OFF_KEY, "1");
    else window.localStorage.removeItem(OFF_KEY);
  } catch {
    // nothing to remember
  }
};

// ---------------------------------------------------------------- sign in & save

let saveTimer = 0;
let syncing = false;

async function saveNow(): Promise<void> {
  if (!plugin || bazaarLoginStore.get().status !== "connected") return;
  try {
    await plugin.saveData({ data: cloudSnapshot(STORAGE_LIMIT) });
  } catch {
    // Offline or Bazaar busy: the next change saves again.
  }
}

/** Saves a few seconds after the last change (bouts, purchases, name, look). */
function scheduleSave(): void {
  if (bazaarLoginStore.get().status !== "connected" || syncing) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 3000);
}

async function sync(): Promise<void> {
  if (!plugin) return;
  syncing = true;
  try {
    const { data } = await plugin.loadData();
    if ((await restoreCloudSave(data, "Cafe Bazaar")) === "kept") {
      syncing = false;
      await saveNow();
    }
  } catch {
    pushToast("Couldn't reach your Bazaar save. We'll try again later.", "info");
  } finally {
    syncing = false;
  }
}

/**
 * Bazaar is installed and new enough; otherwise shows Bazaar's install / update screen.
 * Returns false when the player has to do that first.
 */
async function bazaarReady(): Promise<boolean> {
  if (!plugin) return false;
  const { installed, needsUpdate } = await plugin.status();
  if (!installed) {
    await plugin.showInstallBazaar();
    return false;
  }
  if (needsUpdate) {
    await plugin.showUpdateBazaar();
    return false;
  }
  return true;
}

export async function signInWithBazaar(): Promise<void> {
  if (!plugin || bazaarLoginStore.get().status === "working") return;
  bazaarLoginStore.set({ status: "working" });
  try {
    if (!(await bazaarReady())) {
      bazaarLoginStore.set({ status: "signedOut" });
      return;
    }
    // Not logged in to Bazaar itself: its login page first (then tap sign in again).
    const { loggedIn } = await plugin.isLoggedIn();
    if (loggedIn === false) {
      bazaarLoginStore.set({ status: "signedOut" });
      const choice = await showMessage("Log in to Bazaar", "Log in to your Cafe Bazaar account first, then come back and tap Sign in with Bazaar.", [
        { id: "ok", label: "Open Bazaar", primary: true },
        { id: "cancel", label: "Not now" },
      ]);
      if (choice === "ok") await plugin.open({ page: "login" });
      return;
    }
    const { accountId } = await plugin.signIn();
    if (!accountId) {
      bazaarLoginStore.set({ status: "signedOut" });
      pushToast("Sign in with Bazaar was cancelled", "info");
      return;
    }
    setLoggedOut(false);
    bazaarLoginStore.set({ status: "connected" });
    pushToast("Signed in with Bazaar", "info");
    await sync();
  } catch {
    bazaarLoginStore.set({ status: "signedOut" });
    pushToast("Sign in with Bazaar failed. Try again later.", "error");
  }
}

/**
 * Log out of Bazaar in the game: Bazaar keeps the account on the phone, so the game stops
 * saving there and doesn't sign in automatically until the player signs in again.
 */
export function logOutOfBazaar(): void {
  window.clearTimeout(saveTimer);
  setLoggedOut(true);
  bazaarLoginStore.set({ status: "signedOut" });
  pushToast("Logged out of Bazaar", "info");
}

/** On start: players who signed in before are signed in again (and their save synced). */
export async function initBazaarApp(): Promise<void> {
  if (!plugin) return;
  economyStore.subscribe(scheduleSave);
  settingsStore.subscribe(scheduleSave);
  if (loggedOut()) return;
  try {
    const { accountId } = await plugin.account();
    if (!accountId) return;
    bazaarLoginStore.set({ status: "connected" });
    await sync();
  } catch {
    // stays signed out
  }
}

// ---------------------------------------------------------------- Bazaar pages

/** Rate and review the game in Bazaar. */
export async function rateOnBazaar(): Promise<void> {
  if (!plugin) return;
  try {
    await plugin.open({ page: "review" });
  } catch {
    pushToast("Couldn't open Cafe Bazaar", "error");
  }
}

/** The developer's other games in Bazaar (needs VITE_BAZAAR_DEVELOPER_ID). */
export const moreGamesAvailable = (): boolean => plugin !== null && DEVELOPER_ID !== "";

export async function openMoreGames(): Promise<void> {
  if (!moreGamesAvailable()) return;
  try {
    await plugin!.open({ page: "developer", developerId: DEVELOPER_ID });
  } catch {
    pushToast("Couldn't open Cafe Bazaar", "error");
  }
}

// ---------------------------------------------------------------- updates

/** Whether Bazaar has a newer version of the game (null when Bazaar can't say). */
export async function bazaarHasUpdate(): Promise<boolean | null> {
  if (!plugin) return null;
  try {
    const { state } = await plugin.updateState();
    return state === "needUpdate" ? true : state === "updated" ? false : null;
  } catch {
    return null;
  }
}

/** Bazaar's update page for the game (the new version installs from there). */
export async function updateFromBazaar(): Promise<void> {
  if (!plugin) return;
  try {
    await plugin.update();
  } catch {
    await plugin.open({ page: "update" }).catch(() => undefined);
  }
}

export async function bazaarAutoUpdate(): Promise<"enabled" | "disabled" | "unsupported"> {
  if (!plugin) return "unsupported";
  try {
    return (await plugin.autoUpdateState()).state;
  } catch {
    return "unsupported";
  }
}

export async function enableBazaarAutoUpdate(): Promise<void> {
  await plugin?.enableAutoUpdate().catch(() => undefined);
}
