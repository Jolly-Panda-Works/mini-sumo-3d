import { settingsStore } from "./settings";

/** Short vibration on supported phones (Android browsers/WebView). No-op elsewhere. */
export function vibrate(ms: number): void {
  if (!settingsStore.get().vibration) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported or blocked.
  }
}
