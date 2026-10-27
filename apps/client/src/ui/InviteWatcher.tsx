import { useEffect } from "react";
import { answerFriend, dismissInvite, fetchInvites, friendsAvailable, friendsStore, loadFriends } from "../network/friendsClient";
import { gameStore, roomManager, sessionStore } from "../network/RoomManager";
import { Phase } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { pushToast, showError, showMessage } from "../uiStore";

/**
 * Checks for game invites from friends (every 5 s while online, also in a background tab;
 * this also keeps you shown as online). An invite pops up with Join / Not now; joining leaves any waiting room first.
 * Nothing pops up in the middle of a bout.
 */
const shown = new Set<string>();
/** Friend requests already announced (once per request while the game is open). */
const announcedRequests = new Set<string>();
let lastRequestCheck = 0;

export function InviteWatcher() {
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || !friendsAvailable()) return;
      const phase = gameStore.get().phase;
      if (sessionStore.get().status === "connected" && (phase === Phase.Playing || phase === Phase.Countdown)) return;
      // New friend requests (checked every 15 s): Accept / Not now.
      if (Date.now() - lastRequestCheck > 15_000) {
        lastRequestCheck = Date.now();
        try {
          await loadFriends();
        } catch {
          // keep going with invites
        }
        for (const request of friendsStore.get().data?.incoming ?? []) {
          if (announcedRequests.has(request.accountId)) continue;
          announcedRequests.add(request.accountId);
          const choice = await showMessage("Friend request", `${request.name} (level ${request.level}) wants to be your friend.`, [
            { id: "ok", label: "Accept", primary: true },
            { id: "cancel", label: "Not now" },
          ], { sound: "friend" });
          if (choice === "ok") {
            try {
              await answerFriend(request.accountId, true);
              pushToast(`${request.name} is now your friend`, "info");
            } catch (error) {
              void showError("Couldn't accept", error instanceof Error ? error.message : "Try again.");
            }
          }
        }
      }
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
        ], { sound: "invite" });
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
