import { settingsStore, type Settings } from "../settings";
import { pushToast } from "../uiStore";
import { economyStore, refreshProfile, storedAccount, switchAccount } from "./economyClient";
import { localEconomy, type LocalSnapshot } from "./localEconomy";

/**
 * One save kept by the player's store account (Google Play "Saved Games", Cafe Bazaar's in-app
 * storage): progress on the device, name and look, and the game server account (id and key),
 * so a new phone signs in as the same player.
 */
export interface CloudSave {
  v: 1;
  savedAt: string;
  /** Left out when the save must stay small (Bazaar keeps 10 KB); the server account has it. */
  economy?: LocalSnapshot;
  profile: Pick<Settings, "name" | "appearance" | "botLevel">;
  account?: { accountId: string; token: string };
}

/** Rough measure of how far a save has got, to keep the more advanced one. */
const progress = (s: LocalSnapshot) => s.xp * 1000 + s.matches * 10 + s.owned.length;

/** This device's save as text, at most maxBytes long (UTF-8) when given. */
export function cloudSnapshot(maxBytes?: number): string {
  const { name, appearance, botLevel } = settingsStore.get();
  const account = storedAccount() ?? undefined;
  const save: CloudSave = { v: 1, savedAt: new Date().toISOString(), economy: localEconomy.exportState(), profile: { name, appearance, botLevel }, account };
  let text = JSON.stringify(save);
  if (maxBytes && new TextEncoder().encode(text).length > maxBytes) {
    delete save.economy;
    text = JSON.stringify(save);
  }
  return text;
}

/**
 * After signing in: keep whichever progress is further along.
 * - "switched": the save belongs to another server account (a new or reset phone), so the
 *   game restarts as that player (unless this device's player is further along);
 * - "restored": the save's device progress was further along and is now on this device;
 * - "kept": this device is the one to keep: save it over the store's copy.
 */
export async function restoreCloudSave(data: string, label: string): Promise<"switched" | "restored" | "kept"> {
  let cloud: CloudSave | null = null;
  try {
    cloud = data ? (JSON.parse(data) as CloudSave) : null;
  } catch {
    cloud = null; // unreadable: this device's progress replaces it
  }
  const here = storedAccount();
  const theirs = cloud?.account;
  const fartherHere = (economyStore.get().profile?.level.xp ?? 0) > (cloud?.economy?.xp ?? 0);
  if (theirs?.accountId && theirs.token && theirs.accountId !== here?.accountId && !fartherHere) {
    pushToast(`Progress restored from ${label}`, "info", 3500);
    switchAccount(theirs); // the game restarts as that player
    return "switched";
  }
  const local = localEconomy.exportState();
  if (cloud && cloud.v === 1 && cloud.economy && progress(cloud.economy) > progress(local)) {
    if (localEconomy.importState(cloud.economy)) {
      settingsStore.update({ ...cloud.profile, onboarded: true });
      await refreshProfile();
      pushToast(`Progress restored from ${label}`, "info", 3500);
      return "restored";
    }
  }
  return "kept";
}
