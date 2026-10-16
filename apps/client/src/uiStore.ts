import { createStore } from "./store";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "out" | "error";
}

export interface UIState {
  settingsOpen: boolean;
  aboutOpen: boolean;
  wardrobeOpen: boolean;
  walletOpen: boolean;
  friendsOpen: boolean;
  shopOpen: boolean;
  /** Arena previewed in the 3D background of the home screen. */
  homeArena: string;
  toasts: Toast[];
}

export const uiStore = createStore<UIState>({
  settingsOpen: false,
  aboutOpen: false,
  wardrobeOpen: false,
  walletOpen: false,
  friendsOpen: false,
  shopOpen: false,
  homeArena: "training",
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

export function setAboutOpen(open: boolean): void {
  uiStore.update({ aboutOpen: open });
}

export function setShopOpen(open: boolean): void {
  uiStore.update({ shopOpen: open });
}

export function setFriendsOpen(open: boolean): void {
  uiStore.update({ friendsOpen: open });
}

export function setHomeArena(arenaId: string): void {
  if (uiStore.get().homeArena !== arenaId) uiStore.update({ homeArena: arenaId });
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
