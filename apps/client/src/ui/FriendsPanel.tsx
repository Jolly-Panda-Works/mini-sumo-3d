import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { FriendEntry } from "@mini-sumo/shared";
import { addFriend, answerFriend, friendsAvailable, friendsStore, inviteFriend, loadFriends } from "../network/friendsClient";
import { networkStore } from "../network/networkMode";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { pushToast, setFriendsOpen, showError } from "../uiStore";
import { avatarSrc } from "./Avatar";
import { Dialog } from "./Dialog";
import { FriendProfilePopup } from "./FriendProfilePopup";

/**
 * Friends: your code to share, add a friend by code, answer requests, and your friends with
 * who's online. Tap a friend for their profile; "Play" invites an online friend to a game.
 */
export function FriendsPanel() {
  const network = useStore(networkStore);
  const friends = useStore(friendsStore);
  const [code, setCode] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const online = network.mode === "online";

  useEffect(() => {
    if (!online) return;
    void loadFriends().catch(() => undefined);
    // Keep who's online fresh while the list is open.
    const timer = window.setInterval(() => void loadFriends().catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, [online]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    try {
      await addFriend(code);
      setCode("");
      pushToast("Friend request sent", "info");
    } catch (error) {
      void showError("Couldn't add friend", error instanceof Error ? error.message : "Try again.");
    }
  };

  const copyCode = async () => {
    const mine = friends.data?.code;
    if (!mine) return;
    try {
      await navigator.clipboard.writeText(mine);
      pushToast("Code copied", "info");
    } catch {
      pushToast(mine, "info");
    }
  };

  const data = friends.data;
  return (
    <Dialog title="Friends" onClose={() => setFriendsOpen(false)} className="friends">
      {!online ? (
        <p className="friends__offline">Friends need the game server. Connect to the internet and try again.</p>
      ) : (
        <>
          <section className="friends__code">
            <span className="field__label">Your friend code</span>
            <button className="friends__code-value" onClick={() => void copyCode()} aria-label="Copy your friend code">
              {data?.code ?? "······"}
            </button>
          </section>

          <form className="friends__add" onSubmit={(e) => void add(e)}>
            <input
              className="input input--art"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Friend's code"
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Friend's code"
            />
            <button type="submit" className="btn btn--primary" disabled={!code.trim() || friends.loading}>
              Add
            </button>
          </form>

          {data && data.incoming.length > 0 && (
            <section className="friends__group">
              <h3 className="settings__heading">Requests</h3>
              <ul className="friends__list">
                {data.incoming.map((f) => (
                  <FriendRow key={f.accountId} friend={f} onOpen={() => setViewing(f.accountId)}>
                    <button className="btn btn--small btn--primary" onClick={() => void answerFriend(f.accountId, true).catch(() => undefined)}>
                      Accept
                    </button>
                    <button className="btn btn--small" onClick={() => void answerFriend(f.accountId, false).catch(() => undefined)}>
                      Decline
                    </button>
                  </FriendRow>
                ))}
              </ul>
            </section>
          )}

          <section className="friends__group">
            <h3 className="settings__heading">Friends</h3>
            {data && data.friends.length === 0 && <p className="hint">No friends yet. Share your code, or add a friend's code above.</p>}
            <ul className="friends__list">
              {data?.friends.map((f) => (
                <FriendRow key={f.accountId} friend={f} onOpen={() => setViewing(f.accountId)}>
                  <PlayButton friend={f} />
                </FriendRow>
              ))}
            </ul>
          </section>

          {data && data.outgoing.length > 0 && (
            <section className="friends__group">
              <h3 className="settings__heading">Waiting for an answer</h3>
              <ul className="friends__list">
                {data.outgoing.map((f) => (
                  <FriendRow key={f.accountId} friend={f} onOpen={() => setViewing(f.accountId)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {viewing && <FriendProfilePopup accountId={viewing} onClose={() => setViewing(null)} />}
    </Dialog>
  );
}

export function FriendRow({ friend, onOpen, children }: { friend: FriendEntry; onOpen?: () => void; children?: ReactNode }) {
  return (
    <li className="friend-row">
      <button className="friend-row__who" onClick={onOpen} aria-label={`${friend.name}, level ${friend.level}${friend.online ? ", online" : ""}`}>
        <span className="friend-row__avatar">
          <img src={avatarSrc(friend.avatar)} alt="" width={160} height={160} loading="lazy" />
          <span className={`friend-row__dot${friend.online ? " friend-row__dot--on" : ""}`} aria-hidden="true" />
        </span>
        <span className="friend-row__text">
          <strong>{friend.name}</strong>
          <span>
            Lvl {friend.level} · {friend.online ? "Online" : "Offline"}
          </span>
        </span>
      </button>
      {children && <span className="friend-row__actions">{children}</span>}
    </li>
  );
}

/** Invite a friend to play: opens a private room for you and sends them the invite. */
export function PlayButton({ friend }: { friend: FriendEntry }) {
  const [busy, setBusy] = useState(false);
  const play = async () => {
    if (!friend.online || !friendsAvailable()) return;
    setBusy(true);
    try {
      if (!(await roomManager.createPrivate(settingsStore.get().name, 4))) return;
      const roomId = sessionStore.get().roomId;
      if (roomId) {
        await inviteFriend(friend.accountId, roomId);
        pushToast(`Invite sent to ${friend.name}`, "info");
      }
      setFriendsOpen(false);
    } catch (error) {
      void showError("Couldn't invite", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className="btn btn--small btn--primary"
      aria-disabled={!friend.online || undefined}
      disabled={busy}
      onClick={() => (friend.online ? void play() : pushToast(`${friend.name} is offline`, "info"))}
    >
      Play
    </button>
  );
}
