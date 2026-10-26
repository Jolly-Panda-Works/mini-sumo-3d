import { createStore } from "../store";
import { settingsStore } from "../settings";
import { pushToast } from "../uiStore";
import { economyStore } from "./economyClient";
import { cloudSnapshot, restoreCloudSave } from "./cloudSave";

/**
 * Google Play Games Services (Android app only): sign-in and one cloud save kept by Google
 * for the player's account ("Saved Games"). This needs no game server: progress lives on
 * the device and is mirrored to the player's Google Play account.
 *
 * The native side is apps/mobile/native/PlayGamesPlugin.java, added to the Android build
 * when the repository variable PLAY_GAMES_APP_ID is set.
 */
interface PlayGamesPlugin {
  isAuthenticated(): Promise<{ authenticated: boolean; name?: string }>;
  signIn(): Promise<{ authenticated: boolean; name?: string }>;
  save(options: { data: string; description: string }): Promise<void>;
  load(): Promise<{ data: string }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: <T>(name: string) => T;
}

function findPlugin(): PlayGamesPlugin | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.() || !cap.isPluginAvailable?.("PlayGames") || !cap.registerPlugin) return null;
  return cap.registerPlugin<PlayGamesPlugin>("PlayGames");
}

const plugin = findPlugin();

export const playGamesStore = createStore<{
  available: boolean;
  status: "signedOut" | "working" | "connected";
  name: string;
}>({ available: plugin !== null, status: "signedOut", name: "" });

let saveTimer = 0;
let syncing = false;

async function saveNow(): Promise<void> {
  if (!plugin || playGamesStore.get().status !== "connected") return;
  try {
    await plugin.save({ data: cloudSnapshot(), description: `Level ${economyStore.get().profile?.level.level ?? 1}` });
  } catch {
    // Offline or Google Play busy: the next change saves again.
  }
}

/** Saves a few seconds after the last change (bouts, purchases, name, look). */
function scheduleSave(): void {
  if (playGamesStore.get().status !== "connected" || syncing) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 3000);
}

/** After signing in: keep whichever progress is further along, then mirror it. */
async function sync(): Promise<void> {
  if (!plugin) return;
  syncing = true;
  try {
    const { data } = await plugin.load();
    if ((await restoreCloudSave(data, "Google Play")) === "kept") {
      syncing = false;
      await saveNow();
    }
  } catch {
    pushToast("Couldn't reach Google Play saves. We'll try again later.", "info");
  } finally {
    syncing = false;
  }
}

async function finishSignIn(result: { authenticated: boolean; name?: string }, quiet: boolean): Promise<void> {
  if (!result.authenticated) {
    playGamesStore.set({ available: true, status: "signedOut", name: "" });
    if (!quiet) pushToast("Google Play sign-in was cancelled", "info");
    return;
  }
  playGamesStore.set({ available: true, status: "connected", name: result.name ?? "" });
  if (!quiet) pushToast("Connected to Google Play", "info");
  await sync();
}

/** The player logged out of Google Play in the game: no automatic sign-in until they sign in again. */
const OFF_KEY = "mini-sumo:play-games-off";
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

/**
 * Log out of Google Play in the game. Play Games (v2) has no sign-out of its own (Google
 * keeps the account on the phone), so the game disconnects: it stops saving to Google Play
 * and doesn't sign in automatically until the player taps sign in again.
 */
export function logOutOfPlayGames(): void {
  window.clearTimeout(saveTimer);
  setLoggedOut(true);
  playGamesStore.set({ available: plugin !== null, status: "signedOut", name: "" });
  pushToast("Logged out of Google Play", "info");
}

export async function signInToPlayGames(): Promise<void> {
  if (!plugin || playGamesStore.get().status === "working") return;
  setLoggedOut(false);
  playGamesStore.update({ status: "working" });
  try {
    await finishSignIn(await plugin.signIn(), false);
  } catch {
    playGamesStore.update({ status: "signedOut" });
    pushToast("Google Play sign-in failed. Try again later.", "error");
  }
}

/** On start: Google Play signs returning players in automatically. */
export async function initPlayGames(): Promise<void> {
  if (!plugin) return;
  if (!loggedOut()) {
    try {
      await finishSignIn(await plugin.isAuthenticated(), true);
    } catch {
      // stays signed out
    }
  }
  economyStore.subscribe(scheduleSave);
  settingsStore.subscribe(scheduleSave);
}
