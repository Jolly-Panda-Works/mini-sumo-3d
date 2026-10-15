import { DEFAULT_APPEARANCE, sanitizeAppearance, type Appearance } from "@mini-sumo/shared";
import { createStore } from "./store";

export type TouchMode = "auto" | "on" | "off";

export interface Settings {
  sound: boolean;
  touchControls: TouchMode;
  name: string;
  /** The first-run name prompt has been completed. */
  onboarded: boolean;
  /** Hair, face and outfit; sent when joining and when changed in the lobby. */
  appearance: Appearance;
}

const KEY = "mini-sumo:settings";

function load(): Settings {
  const defaults: Settings = { sound: true, touchControls: "auto", name: "", onboarded: false, appearance: { ...DEFAULT_APPEARANCE } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : defaults.sound,
      touchControls: parsed.touchControls === "on" || parsed.touchControls === "off" ? parsed.touchControls : "auto",
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 32) : "",
      onboarded: typeof parsed.onboarded === "boolean" ? parsed.onboarded : Boolean(parsed.name?.trim()),
      appearance: sanitizeAppearance(parsed.appearance),
    };
  } catch {
    return defaults;
  }
}

export const settingsStore = createStore<Settings>(load());

settingsStore.subscribe(() => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settingsStore.get()));
  } catch {
    // Storage can be unavailable (private mode); settings then last for the session only.
  }
});

export function isCoarsePointer(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
}

export function touchControlsEnabled(mode: TouchMode): boolean {
  return mode === "on" || (mode === "auto" && isCoarsePointer());
}
