import { createStore } from "../store";
import { settingsStore, type Settings } from "../settings";
import { pushToast } from "../uiStore";
import { economyStore, refreshProfile } from "./economyClient";
import { localEconomy, type LocalSnapshot } from "./localEconomy";

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

interface CloudSave {
  v: 1;
  savedAt: string;
  economy: LocalSnapshot;
  profile: Pick<Settings, "name" | "appearance" | "botLevel">;
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

/** Rough measure of how far a save has got, to keep the more advanced one. */
const progress = (s: LocalSnapshot) => s.xp * 1000 + s.matches * 10 + s.owned.length;

function snapshot(): CloudSave {
  const { name, appearance, botLevel } = settingsStore.get();
  return { v: 1, savedAt: new Date().toISOString(), economy: localEconomy.exportState(), profile: { name, appearance, botLevel } };
}

let saveTimer = 0;
let syncing = false;

async function saveNow(): Promise<void> {
  if (!plugin || playGamesStore.get().status !== "connected") return;
  try {
    const data = snapshot();
    await plugin.save({ data: JSON.stringify(data), description: `Level ${economyStore.get().profile?.level.level ?? 1}` });
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
    const cloud = data ? (JSON.parse(data) as CloudSave) : null;
    const local = localEconomy.exportState();
    if (cloud && cloud.v === 1 && cloud.economy && progress(cloud.economy) > progress(local)) {
      if (localEconomy.importState(cloud.economy)) {
        settingsStore.update({ ...cloud.profile, onboarded: true });
        await refreshProfile();
        pushToast("Progress restored from Google Play", "info", 3500);
      }
    } else {
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

export async function signInToPlayGames(): Promise<void> {
  if (!plugin || playGamesStore.get().status === "working") return;
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
  try {
    await finishSignIn(await plugin.isAuthenticated(), true);
  } catch {
    // stays signed out
  }
  economyStore.subscribe(scheduleSave);
  settingsStore.subscribe(scheduleSave);
}
