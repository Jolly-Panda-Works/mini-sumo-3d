import { CREDITS } from "@mini-sumo/shared";
import { request } from "./economyClient";
import { bazaarAppAvailable, bazaarHasUpdate, updateFromBazaar } from "./bazaarApp";
import { showMessage, showWarning } from "../uiStore";

/**
 * Update check at startup: the game server says which version is the latest (and, optionally,
 * the oldest that may still play). Older apps are sent to their store page to update:
 * Cafe Bazaar or Google Play for the Android builds, the game's web page for the desktop app; the web game just reloads (the server always serves the latest). Self-updating outside
 * the store isn't allowed by the stores.
 */
const PACKAGE = "com.jollypanda.mini_sumo";
const LATER_KEY = "mini-sumo:update-later";

/** "1.22.0" -> [1, 22, 0]; null for dev / media builds ("1.21.0-dev.117", "media", none). */
function parse(version: string | undefined): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((version ?? "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function older(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

/** The desktop app (Electron): its files are bundled, so a reload can't update it. */
const isDesktopApp = (): boolean => /Electron\//.test(navigator.userAgent);

const isNative = (): boolean =>
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

/** Where this build updates. */
function updateTarget(): { kind: "store"; url: string; name: string } | { kind: "reload" } {
  if (isDesktopApp()) return { kind: "store", url: CREDITS.projectUrl, name: "the Mini Sumo page" };
  if (!isNative()) return { kind: "reload" };
  if (import.meta.env.VITE_STORE === "bazaar") return { kind: "store", url: `https://cafebazaar.ir/app/${PACKAGE}`, name: "Cafe Bazaar" };
  return { kind: "store", url: `https://play.google.com/store/apps/details?id=${PACKAGE}`, name: "Google Play" };
}

function openUpdate(): void {
  // The Bazaar build: Bazaar's own update page (the new version installs from there).
  if (bazaarAppAvailable()) {
    void updateFromBazaar();
    return;
  }
  const target = updateTarget();
  if (target.kind === "reload") window.location.reload();
  // The app hands store links to Android, which opens the store app (or the browser).
  else window.open(target.url, "_blank");
}

let checked = false;
let bazaarChecked = false;

/** "Later" for this update (remembered per version). */
function later(version: string): boolean {
  try {
    return localStorage.getItem(LATER_KEY) === version;
  } catch {
    return false; // no storage: ask every time
  }
}
function setLater(version: string): void {
  try {
    localStorage.setItem(LATER_KEY, version);
  } catch {
    // nothing to remember
  }
}

/**
 * The Bazaar build: asks Bazaar whether it has a newer version of the game (no game server
 * needed). "Update" opens Bazaar's update page in the game.
 */
export async function checkBazaarUpdate(): Promise<void> {
  if (bazaarChecked || !bazaarAppAvailable()) return;
  bazaarChecked = true;
  if (!(await bazaarHasUpdate()) || later("bazaar")) return;
  const choice = await showMessage("Update available", "A new version of Mini Sumo is out in Cafe Bazaar, with new things to try. Update now?", [
    { id: "ok", label: "Update", primary: true },
    { id: "cancel", label: "Later" },
  ]);
  if (choice === "ok") void updateFromBazaar();
  else setLater("bazaar");
}

export async function checkForUpdate(): Promise<void> {
  if (checked) return;
  checked = true;
  const mine = parse(import.meta.env.VITE_APP_VERSION as string | undefined);
  if (!mine) return; // dev and media builds don't check
  let info: { latest: string; min: string };
  try {
    info = await request<{ latest: string; min: string }>("/version", {}, false);
  } catch {
    return; // an older server or offline: nothing to say
  }
  const latest = parse(info.latest);
  const min = parse(info.min);
  const target = updateTarget();

  // Web: the server always serves the latest; an older page is just a cached one.
  if (target.kind === "reload") {
    if (latest && older(mine, latest) && sessionStorage.getItem("mini-sumo:reloaded") !== info.latest) {
      sessionStorage.setItem("mini-sumo:reloaded", info.latest);
      window.location.reload();
    }
    return;
  }

  if (min && older(mine, min)) {
    // Too old to play: the window comes back until the player updates.
    for (;;) {
      await showWarning(
        "Update required",
        `This version of Mini Sumo is too old to play online. Update to version ${info.latest || info.min} in ${target.name} to keep playing.`,
        [{ id: "leave", label: "Update", primary: true }],
      );
      openUpdate();
    }
  }

  // The Bazaar build asks Bazaar itself (checkBazaarUpdate), which knows when the update is live.
  if (latest && older(mine, latest) && !bazaarAppAvailable()) {
    if (later(info.latest)) return;
    const choice = await showMessage("Update available", `Mini Sumo ${info.latest} is out, with new things to try. Update in ${target.name}?`, [
      { id: "ok", label: "Update", primary: true },
      { id: "cancel", label: "Later" },
    ]);
    if (choice === "ok") openUpdate();
    else setLater(info.latest);
  }
}
