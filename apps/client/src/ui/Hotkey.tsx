import { useEffect, useRef } from "react";
import { settingsStore, touchControlsEnabled } from "../settings";
import { useStore } from "../store";
import { uiStore } from "../uiStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/** Keyboard players (web and desktop): no on-screen stick, so buttons show their keys. */
export function useKeyboardUi(): boolean {
  const settings = useStore(settingsStore);
  return !touchControlsEnabled(settings.touchControls);
}

/**
 * Runs `action` when one of `keys` (KeyboardEvent.code, e.g. "Enter", "KeyH") is pressed,
 * unless you're typing or a panel or popup is open on top.
 */
export function useHotkey(keys: readonly string[], action: () => void, enabled = true): void {
  const latest = useRef(action);
  latest.current = action;
  const codes = keys.join(",");
  useEffect(() => {
    if (!enabled) return;
    const list = codes.split(",");
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || !list.includes(e.code) || isTypingTarget(e.target)) return;
      const ui = uiStore.get();
      if (ui.settingsOpen || ui.notices.length > 0) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [codes, enabled]);
}

/** A small keyboard key drawn on a button ("Enter", "H", "Space"). */
export function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="keycap" aria-hidden="true">
      {children}
    </kbd>
  );
}
