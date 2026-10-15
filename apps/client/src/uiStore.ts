import { createStore } from "./store";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "out" | "error";
}

export const uiStore = createStore<{ settingsOpen: boolean; wardrobeOpen: boolean; arenasOpen: boolean; walletOpen: boolean; toasts: Toast[] }>({
  settingsOpen: false,
  wardrobeOpen: false,
  arenasOpen: false,
  walletOpen: false,
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

export function setArenasOpen(open: boolean): void {
  uiStore.update({ arenasOpen: open });
}

export function setWalletOpen(open: boolean): void {
  uiStore.update({ walletOpen: open });
}

export function setWardrobeOpen(open: boolean): void {
  uiStore.update({ wardrobeOpen: open });
}

export function setSettingsOpen(open: boolean): void {
  uiStore.update({ settingsOpen: open });
}
