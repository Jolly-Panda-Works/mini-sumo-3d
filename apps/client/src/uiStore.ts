import { createStore } from "./store";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "out" | "error";
}

export const uiStore = createStore<{ settingsOpen: boolean; toasts: Toast[] }>({
  settingsOpen: false,
  toasts: [],
});

let toastId = 0;

export function pushToast(text: string, tone: Toast["tone"] = "info", durationMs = 2600): void {
  const id = ++toastId;
  const toasts = [...uiStore.get().toasts, { id, text, tone }].slice(-4);
  uiStore.update({ toasts });
  window.setTimeout(() => {
    uiStore.update({ toasts: uiStore.get().toasts.filter((t) => t.id !== id) });
  }, durationMs);
}

export function setSettingsOpen(open: boolean): void {
  uiStore.update({ settingsOpen: open });
}
