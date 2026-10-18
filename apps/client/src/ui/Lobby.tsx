import { useEffect, useState } from "react";
import { MIN_PLAYERS, Phase } from "@mini-sumo/shared";
import { networkStore } from "../network/networkMode";
import { gameStore, roomManager, sessionStore } from "../network/RoomManager";
import { economyStore } from "../network/economyClient";
import { Coins } from "./Coins";
import { Icon } from "./Icon";
import { Dialog } from "./Dialog";
import { FriendRow, SmallArt } from "./FriendsPanel";
import { friendsAvailable, friendsStore, inviteFriend, loadFriends } from "../network/friendsClient";
import { useStore } from "../store";
import { pushToast, setInviteUiOpen, showError, showWarning, uiStore } from "../uiStore";
import { PlayerBadge } from "./PlayerBadge";

export function Lobby() {
  const game = useStore(gameStore);
  const session = useStore(sessionStore);
  const { mode } = useStore(networkStore);
  const offline = mode === "offline";
  const economy = useStore(economyStore);
  const arena = economy.catalog?.arenas.find((a) => a.id === game.arenaId);
  const paid = (arena?.entryFee ?? 0) > 0;
  const you = game.players.find((p) => p.isYou);
  const isHost = Boolean(you?.isHost);
  const connected = game.players.filter((p) => p.connected);
  const canStart = isHost && game.phase === Phase.Lobby && connected.length >= MIN_PLAYERS;
  const full = connected.length >= game.maxPlayers;
  const searching = !game.isPrivate && game.searchRemainingMs > 0;
  // Online paid arenas start on their own; everything else is started by the host.
  const autoStart = paid && !offline;
  // The button unlocks one second after the wait is over (and the bots have arrived).
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (searching || !canStart) {
      setArmed(false);
      return;
    }
    const timer = window.setTimeout(() => setArmed(true), 1000);
    return () => window.clearTimeout(timer);
  }, [searching, canStart]);
  const searchSeconds = Math.ceil(game.searchRemainingMs / 1000);
  const slots = Array.from({ length: game.maxPlayers }, (_, i) => connected[i] ?? null);
  // The host may add bots in private rooms and in Training (not in paid arenas).
  const botsAllowed = game.isPrivate || game.arenaId === "training";
  // The host of a private room with other players: leaving closes it for everyone.
  const others = connected.filter((p) => !p.isYou && !p.isBot).length;
  const leaveRoom = async () => {
    if (game.isPrivate && isHost && others > 0) {
      const choice = await showWarning("Close the room?", "You're the host. If you leave, the room closes and everyone is sent home.", [
        { id: "leave", label: "Leave", primary: true },
        { id: "cancel", label: "Stay" },
      ]);
      if (choice !== "leave") return;
    }
    await roomManager.leave();
  };
  const inviting = useStore(uiStore).invitePickerOpen;
  // The picker belongs to this room: close it when leaving.
  useEffect(() => () => setInviteUiOpen(false), []);
  const inRoomIds = new Set(game.players.map((p) => p.accountId).filter(Boolean));

  // The start button sits in the fixed footer, so the waiting room never scrolls.
  const startArea = autoStart ? null : isHost ? (
          <>
            <button
              className="start-btn lobby__start"
              disabled={!canStart || !armed}
              onClick={() => roomManager.startMatch()}
              aria-live="polite"
            >
              <span className="start-btn__text">
                {searching ? `Start match in ${searchSeconds}…` : canStart ? "Start match" : "Waiting for others…"}
              </span>
            </button>
            {!canStart && !searching && (
              <p className="hint">
                You need at least {MIN_PLAYERS} wrestlers.{" "}
                {offline
                  ? "Add a bot to start."
                  : game.isPrivate
                    ? "Add a random player or invite a friend with +."
                    : "Waiting for another player to join."}
              </p>
            )}
          </>
        ) : (
          <p className="hint hint--center">Waiting for the host to start the match.</p>
        );

  return (
    <Dialog
      footer={startArea}
      title={game.isPrivate ? "Private room" : (arena?.name ?? "Training Arena")}
      onClose={() => void leaveRoom()}
      className="lobby"
      overlayClassName="overlay--lobby"
    >

        <ul className="roster">
          {slots.map((p, i) =>
            p ? (
              <li key={p.id} className={`roster__item${p.isYou ? " roster__item--you" : ""}`}>
                <PlayerBadge colorIndex={p.colorIndex} />
                <span className="roster__name">{p.name}</span>
                {p.isYou && <span className="tag">You</span>}
                {p.isHost && <img className="tag-host" src={`${import.meta.env.BASE_URL}ui/label-host.webp`} alt="Host" width={200} height={114} />}
                {p.isBot && isHost && (
                  <button className="roster__remove" onClick={() => roomManager.removeBot(p.id)} aria-label={`Remove ${p.name}`}>
                    Remove
                  </button>
                )}
              </li>
            ) : (
              <li key={`empty-${i}`} className="roster__item roster__item--empty">
                {!offline && friendsAvailable() ? (
                  <button className="roster__invite" onClick={() => setInviteUiOpen(true)} aria-label="Invite a friend">
                    <span className="roster__plus" aria-hidden="true">
                      +
                    </span>
                    Invite a friend
                  </button>
                ) : offline && botsAllowed && isHost ? (
                  <button className="roster__invite" onClick={() => roomManager.addBot()} aria-label="Add a random player">
                    <span className="roster__plus" aria-hidden="true">
                      +
                    </span>
                    Add random player
                  </button>
                ) : (
                  "Waiting for a wrestler…"
                )}
              </li>
            ),
          )}
        </ul>

        {autoStart && arena && (
          <div className="search" role="status" aria-live="polite">
            <span className="search__spinner" aria-hidden="true" />
            <div>
              <p className="search__title">
                {connected.length >= 2
                  ? `Bout starts in ${searchSeconds}s`
                  : `Looking for opponents… ${searchSeconds}s`}
              </p>
              <p className="hint">
                Entry paid: <Coins amount={arena.entryFee} />. Refunded if the bout doesn't start or you leave before it does.
              </p>
            </div>
          </div>
        )}


        {inviting && !offline && (
          <InvitePicker
            roomId={session.roomId}
            inRoom={inRoomIds}
            onClose={() => setInviteUiOpen(false)}
            isPrivate={game.isPrivate}
            botsAllowed={botsAllowed}
            isHost={isHost}
            full={full}
          />
        )}
        {paid && <p className="hint hint--center">Leave with × before the bout starts to get your entry back.</p>}
    </Dialog>
  );
}

/** Friends to invite into this room (online friends first; those already here are left out). */
function InvitePicker({
  roomId,
  inRoom,
  onClose,
  isPrivate,
  botsAllowed,
  isHost,
  full,
}: {
  roomId: string;
  inRoom: Set<string>;
  onClose: () => void;
  isPrivate: boolean;
  botsAllowed: boolean;
  isHost: boolean;
  full: boolean;
}) {
  const friends = useStore(friendsStore);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomManager.inviteLink());
      setCopied(true);
      pushToast("Invite link copied", "info");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      pushToast(roomManager.inviteLink(), "info", 6000);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Mini Sumo", text: "Join my Mini Sumo room!", url: roomManager.inviteLink() });
    } catch {
      // Share sheet dismissed.
    }
  };
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!friendsAvailable()) return;
    void loadFriends().catch(() => undefined);
    const timer = window.setInterval(() => void loadFriends().catch(() => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  // Everyone on your friends list: friends already here (or busy elsewhere) say so instead of INVITE.
  const list = friends.data?.friends ?? [];
  const invite = async (accountId: string, name: string) => {
    try {
      await inviteFriend(accountId, roomId);
      setSent((s) => new Set(s).add(accountId));
      pushToast(`Invite sent to ${name}`, "info");
    } catch (error) {
      void showError("Couldn't send the invite", error instanceof Error ? error.message : "Try again.");
    }
  };
  return (
    <Dialog title="Invite friends" onClose={onClose} className="invite-picker" variant="sub">
      {isPrivate && (
        <div className="invite-picker__share">
          <button className="art art--invite" onClick={() => void copy()} aria-label={copied ? "Invite link copied" : "Copy invite link"}>
            <img src={`${import.meta.env.BASE_URL}ui/btn-copy-invite.webp`} alt="" width={480} height={130} draggable={false} />
          </button>
          {"share" in navigator && (
            <button className="art art--share" onClick={() => void share()} aria-label="Share">
              <img src={`${import.meta.env.BASE_URL}ui/btn-share.webp`} alt="" width={360} height={160} draggable={false} />
            </button>
          )}
        </div>
      )}
      {botsAllowed && isHost && (
        <button className="btn invite-picker__bot" disabled={full} onClick={() => roomManager.addBot()}>
          {full ? "Room is full" : "Add random player"}
        </button>
      )}
      {friends.data && list.length === 0 && (
        <p className="hint hint--center invite-picker__empty">No friends yet. Add friends with their code in Friends.</p>
      )}
      {list.length > 0 && (
      <ul className="friends__list">
        {list.map((f) => (
          <FriendRow key={f.accountId} friend={f}>
            {inRoom.has(f.accountId) ? (
              <span className="friend-row__state friend-row__state--here">In lobby</span>
            ) : f.activity === "in_match" ? (
              <span className="friend-row__state">In match</span>
            ) : f.activity === "in_lobby" ? (
              <span className="friend-row__state">In a lobby</span>
            ) : !f.online ? (
              <span className="friend-row__state">Offline</span>
            ) : (
              <SmallArt
                art={sent.has(f.accountId) ? "btn-sent" : "btn-invite"}
                label={sent.has(f.accountId) ? `Invite sent to ${f.name}` : `Invite ${f.name}`}
                disabled={sent.has(f.accountId)}
                onClick={() => void invite(f.accountId, f.name)}
              />
            )}
          </FriendRow>
        ))}
      </ul>
      )}
    </Dialog>
  );
}
