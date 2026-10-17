import { sanitizeAppearance, type ProfileResponse, type ProfileSyncRequest } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { applyServerProfile, economyStore, request } from "./economyClient";
import { localEconomy } from "./localEconomy";
import { networkStore } from "./networkMode";

/**
 * The profile lives on the device first: name, picture/look, XP and level work with no
 * server and are saved locally. When the server is reachable, the device's copy is sent and
 * merged (newer name/look wins, higher XP and stats win) and the result is kept on both.
 */
const UPDATED_KEY = "mini-sumo:profile-updated-at";

function readUpdatedAt(): string {
  try {
    return window.localStorage.getItem(UPDATED_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeUpdatedAt(value: string): void {
  try {
    window.localStorage.setItem(UPDATED_KEY, value);
  } catch {
    // Without storage the next sync simply sends "now".
  }
}

// Note every change of name or look, so the newer side can win on sync.
let applyingServer = false;
let last = JSON.stringify([settingsStore.get().name, settingsStore.get().appearance]);
settingsStore.subscribe(() => {
  const now = JSON.stringify([settingsStore.get().name, settingsStore.get().appearance]);
  if (now === last) return;
  last = now;
  if (!applyingServer) writeUpdatedAt(new Date().toISOString());
  scheduleSync();
});

let timer = 0;
function scheduleSync(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncProfile(), 1500);
}

let syncing: Promise<void> | null = null;

/** Sends the device's profile and applies the merged result (online only). */
export function syncProfile(): Promise<void> {
  if (networkStore.get().mode !== "online" || economyStore.get().status !== "ready") return Promise.resolve();
  syncing ??= (async () => {
    const settings = settingsStore.get();
    const progress = localEconomy.progress();
    const body: ProfileSyncRequest = {
      name: settings.name,
      appearance: settings.appearance,
      ...progress,
      updatedAt: readUpdatedAt() || new Date(0).toISOString(),
    };
    try {
      const profile = await request<ProfileResponse>("/profile/sync", { method: "POST", body: JSON.stringify(body) });
      // The server's name/look is newer (changed on another device): take it.
      if (profile.profileUpdatedAt && profile.profileUpdatedAt > body.updatedAt) {
        applyingServer = true;
        settingsStore.update({
          ...(profile.name ? { name: profile.name } : {}),
          appearance: sanitizeAppearance(profile.appearance),
        });
        applyingServer = false;
        writeUpdatedAt(profile.profileUpdatedAt);
      }
      applyServerProfile(profile);
    } catch {
      // Server unreachable: everything stays on the device; the next sync sends it.
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
