import { useEffect } from "react";
import { dismissInvite, fetchInvites, friendsAvailable } from "../network/friendsClient";
import { gameStore, roomManager, sessionStore } from "../network/RoomManager";
import { Phase } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { showMessage } from "../uiStore";

/**
 * Checks for game invites from friends (every 5 s while online, also in a background tab;
 * this also keeps you shown as online). An invite pops up with Join / Not now; joining leaves any waiting room first.
 * Nothing pops up in the middle of a bout.
 */
const shown = new Set<string>();

export function InviteWatcher() {
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || !friendsAvailable()) return;
      const phase = gameStore.get().phase;
      if (sessionStore.get().status === "connected" && (phase === Phase.Playing || phase === Phase.Countdown)) return;
      let invites;
      try {
        invites = await fetchInvites();
      } catch {
        return;
      }
      for (const invite of invites) {
        if (shown.has(invite.id)) continue;
        shown.add(invite.id);
        const choice = await showMessage("Game invite", `${invite.from.name} invites you to play. Join the game?`, [
          { id: "ok", label: "Join", primary: true },
          { id: "cancel", label: "Not now" },
        ]);
        void dismissInvite(invite.id);
        if (choice === "ok") {
          if (sessionStore.get().status === "connected") await roomManager.leave();
          await roomManager.joinByCode(invite.roomId, settingsStore.get().name);
        }
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
