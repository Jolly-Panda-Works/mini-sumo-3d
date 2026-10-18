import type { ReactNode } from "react";
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
  profileOpen: boolean;
  /** Level-up celebration after a bout. */
  levelUp: { from: number; to: number; coins: number } | null;
  /** Arena previewed in the 3D background of the home screen. */
  homeArena: string;
  toasts: Toast[];
  /** Message / warning / error popups, shown one at a time (first in the queue). */
  notices: Notice[];
  /** Developer tools (?dev, or tap the version label 7 times in settings). */
  devOpen: boolean;
  /** The friend picker in the waiting room (from + or right after "Play with friends"). */
  invitePickerOpen: boolean;
  leaderboardOpen: boolean;
}

export type NoticeKind = "message" | "warning" | "error";

export interface NoticeAction {
  id: string;
  label: string;
  /** The main action (drawn first and focused). */
  primary?: boolean;
  /** Drawn as the BUY art button with this price in its field. */
  price?: number;
}

export interface Notice {
  id: number;
  kind: NoticeKind;
  title: string;
  message: string;
  actions: NoticeAction[];
  /** A close (×) button in the corner; it answers "cancel". */
  closable?: boolean;
  /** Shown in the lower box instead of the message text (e.g. an item and your coins). */
  body?: ReactNode;
  resolve: (actionId: string) => void;
}

export const uiStore = createStore<UIState>({
  settingsOpen: false,
  aboutOpen: false,
  wardrobeOpen: false,
  walletOpen: false,
  friendsOpen: false,
  shopOpen: false,
  profileOpen: false,
  levelUp: null,
  homeArena: "training",
  toasts: [],
  notices: [],
  devOpen: false,
  invitePickerOpen: false,
  leaderboardOpen: false,
});

let noticeId = 0;

/**
 * Shows a message, warning or error popup and resolves with the id of the chosen action
 * ("close" when dismissed). Without actions it shows a single OK.
 */
export function showNotice(
  kind: NoticeKind,
  title: string,
  message: string,
  actions?: NoticeAction[],
  options: { closable?: boolean; body?: ReactNode } = {},
): Promise<string> {
  return new Promise((resolve) => {
    const id = ++noticeId;
    const notice: Notice = {
      id,
      kind,
      title,
      message,
      actions: actions && actions.length ? actions : [{ id: "ok", label: "OK", primary: true }],
      closable: options.closable,
      body: options.body,
      resolve: (actionId) => {
        uiStore.update({ notices: uiStore.get().notices.filter((n) => n.id !== id) });
        resolve(actionId);
      },
    };
    uiStore.update({ notices: [...uiStore.get().notices, notice] });
  });
}

export const showMessage = (title: string, message: string, actions?: NoticeAction[], options?: { closable?: boolean; body?: ReactNode }) =>
  showNotice("message", title, message, actions, options);
export const showWarning = (title: string, message: string, actions?: NoticeAction[]) => showNotice("warning", title, message, actions);
export const showError = (title: string, message: string, actions?: NoticeAction[]) => showNotice("error", title, message, actions);

export const setDevOpen = (devOpen: boolean) => uiStore.update({ devOpen });
export const setInviteUiOpen = (invitePickerOpen: boolean) => uiStore.update({ invitePickerOpen });
export const setLeaderboardOpen = (leaderboardOpen: boolean) => uiStore.update({ leaderboardOpen });

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

export function showLevelUp(levelUp: { from: number; to: number; coins: number } | null): void {
  uiStore.update({ levelUp });
}

export function setProfileOpen(open: boolean): void {
  uiStore.update({ profileOpen: open });
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
