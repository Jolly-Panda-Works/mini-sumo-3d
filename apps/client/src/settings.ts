import { DEFAULT_APPEARANCE, sanitizeAppearance, sanitizeBotLevel, type Appearance, type BotLevel } from "@mini-sumo/shared";
import { createStore } from "./store";

export type TouchMode = "auto" | "on" | "off";
export type JoystickMode = "floating" | "fixed";

export interface Settings {
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
  touchControls: TouchMode;
  /** Floating: the stick appears where you touch. Fixed: always bottom-left. */
  joystick: JoystickMode;
  /** Short vibrations on dash and hits (supported Android devices). */
  vibration: boolean;
  name: string;
  /** The first-run name prompt has been completed. */
  onboarded: boolean;
  /** Bot difficulty for training and private rooms. */
  botLevel: BotLevel;
  /** Hair, face and outfit; sent when joining and when changed in the lobby. */
  appearance: Appearance;
}

const KEY = "mini-sumo:settings";

function load(): Settings {
  const defaults: Settings = { musicVolume: 0.5, sfxVolume: 0.8, touchControls: "auto", joystick: "fixed", vibration: true, name: "", onboarded: false, botLevel: "normal", appearance: { ...DEFAULT_APPEARANCE } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings> & { sound?: boolean };
    const volume = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    return {
      musicVolume: volume(parsed.musicVolume, parsed.sound === false ? 0 : defaults.musicVolume),
      sfxVolume: volume(parsed.sfxVolume, parsed.sound === false ? 0 : defaults.sfxVolume),
      // The option was removed from settings: touch controls always follow the device.
      touchControls: "auto",
      joystick: parsed.joystick === "floating" ? "floating" : "fixed",
      vibration: typeof parsed.vibration === "boolean" ? parsed.vibration : true,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 32) : "",
      onboarded: typeof parsed.onboarded === "boolean" ? parsed.onboarded : Boolean(parsed.name?.trim()),
      appearance: sanitizeAppearance(parsed.appearance),
      botLevel: sanitizeBotLevel(parsed.botLevel),
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
