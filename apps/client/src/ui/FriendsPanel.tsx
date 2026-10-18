import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { FriendEntry } from "@mini-sumo/shared";
import { addFriend, answerFriend, friendsAvailable, friendsStore, inviteFriend, loadFriends } from "../network/friendsClient";
import { networkStore } from "../network/networkMode";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { pushToast, setFriendsOpen, setInviteUiOpen, showError } from "../uiStore";
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

  // Opens a private room, then the friend picker to invite friends into it.
  const [creating, setCreating] = useState(false);
  const playWithFriends = async () => {
    setCreating(true);
    try {
      if (await roomManager.createPrivate(settingsStore.get().name, 4)) {
        setFriendsOpen(false);
        setInviteUiOpen(true);
      }
    } finally {
      setCreating(false);
    }
  };

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
          <button className="plank-btn plank-btn--primary friends__play" disabled={creating} onClick={() => void playWithFriends()}>
            {creating ? "Opening a room…" : "Play with friends"}
          </button>

          <section className="friends__code">
            <span className="field__label">Your friend code</span>
            <button className="code-field friends__code-value" onClick={() => void copyCode()} aria-label="Copy your friend code">
              <span className="code-field__text">{data?.code ?? "······"}</span>
            </button>
          </section>

          <form className="friends__add" onSubmit={(e) => void add(e)}>
            <input
              className="code-field code-field--input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Friend's code"
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Friend's code"
            />
            <button type="submit" className="art art--add" disabled={!code.trim() || friends.loading} aria-label="Add friend">
              <img src={`${import.meta.env.BASE_URL}ui/btn-add.webp`} alt="" draggable={false} />
            </button>
          </form>

          {data && data.incoming.length > 0 && (
            <section className="friends__group">
              <h3 className="settings__heading">Requests</h3>
              <ul className="friends__list">
                {data.incoming.map((f) => (
                  <FriendRow key={f.accountId} friend={f} onOpen={() => setViewing(f.accountId)}>
                    <SmallArt art="btn-accept" label={`Accept ${f.name}`} onClick={() => void answerFriend(f.accountId, true).catch(() => undefined)} />
                    <SmallArt art="btn-decline" label={`Decline ${f.name}`} onClick={() => void answerFriend(f.accountId, false).catch(() => undefined)} />
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
                  <FriendRow key={f.accountId} friend={f} pending onOpen={() => setViewing(f.accountId)} />
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

export function FriendRow({
  friend,
  onOpen,
  children,
  pending = false,
}: {
  friend: FriendEntry;
  onOpen?: () => void;
  children?: ReactNode;
  /** A request you sent that they haven't accepted yet. */
  pending?: boolean;
}) {
  return (
    <li className="friend-row">
      <button className="friend-row__who" onClick={onOpen} aria-label={`${friend.name}, level ${friend.level}${friend.online ? ", online" : ""}`}>
        <span className="friend-row__avatar">
          <img src={avatarSrc(friend.avatar)} alt="" width={160} height={160} loading="lazy" />
        </span>
        <span className="friend-row__text">
          <strong>{friend.name}</strong>
          <span className="friend-row__level">Lvl {friend.level}</span>
          {pending ? (
            <span className="friend-row__status friend-row__status--pending">Not accepted yet</span>
          ) : (
            <span className={`friend-row__status${friend.online ? " friend-row__status--on" : ""}`}>
              <img src={`${import.meta.env.BASE_URL}ui/dot-${friend.online ? "online" : "offline"}.webp`} alt="" width={35} height={35} />
              {friend.online ? "Online" : "Offline"}
            </span>
          )}
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
    <SmallArt
      art="btn-play-friend"
      label={`Play with ${friend.name}`}
      ariaDisabled={!friend.online}
      disabled={busy}
      onClick={() => (friend.online ? void play() : pushToast(`${friend.name} is offline`, "info"))}
    />
  );
}

/** A small art button (ACCEPT, DECLINE, PLAY, INVITE, SENT…). */
export function SmallArt({
  art,
  label,
  onClick,
  disabled,
  ariaDisabled,
}: {
  art: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ariaDisabled?: boolean;
}) {
  return (
    <button type="button" className="art art--small" onClick={onClick} disabled={disabled} aria-disabled={ariaDisabled || undefined} aria-label={label}>
      <img src={`${import.meta.env.BASE_URL}ui/${art}.webp`} alt="" draggable={false} />
    </button>
  );
}
