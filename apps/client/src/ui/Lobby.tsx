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
import { pushToast } from "../uiStore";
import { PlayerBadge } from "./PlayerBadge";

export function Lobby() {
  const game = useStore(gameStore);
  const session = useStore(sessionStore);
  const [copied, setCopied] = useState<"" | "link" | "failed">("");
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
  const link = roomManager.inviteLink();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("link");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied(""), 2200);
  };

  const share = async () => {
    try {
      await navigator.share({ title: "Mini Sumo", text: "Join my Mini Sumo room!", url: link });
    } catch {
      // Share sheet dismissed.
    }
  };

  const slots = Array.from({ length: game.maxPlayers }, (_, i) => connected[i] ?? null);

  // The start button sits in the fixed footer, so the waiting room never scrolls.
  const startArea = autoStart ? null : isHost ? (
          <>
            <button
              className="start-btn lobby__start"
              disabled={!canStart || !armed}
              onClick={() => roomManager.startMatch()}
              aria-live="polite"
            >
              <span className="start-btn__text">{searching ? `Start match in ${searchSeconds}…` : "Start match"}</span>
            </button>
            {!canStart && !searching && (
              <p className="hint">
                You need at least {MIN_PLAYERS} wrestlers.{" "}
                {offline
                  ? "Add a bot to start."
                  : game.isPrivate
                    ? "Add a bot or send the invite link to a friend."
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
      onClose={() => void roomManager.leave()}
      className="lobby"
      overlayClassName="overlay--lobby"
    >

        {!offline && (
        <div className="row">
          <button className="art art--invite" onClick={() => void copy()} aria-label={copied === "link" ? "Invite link copied" : "Copy invite link"}>
            <img src={`${import.meta.env.BASE_URL}ui/btn-copy-invite.webp`} alt="" width={480} height={130} draggable={false} />
          </button>
          {"share" in navigator && (
            <button className="art art--share" onClick={() => void share()} aria-label="Share">
              <img src={`${import.meta.env.BASE_URL}ui/btn-share.webp`} alt="" width={360} height={160} draggable={false} />
            </button>
          )}
        </div>
        )}
        {copied === "failed" && !offline && (
          <label className="field">
            <span className="field__label">Copy this link</span>
            <input className="input input--code" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}

        <ul className="roster">
          {slots.map((p, i) =>
            p ? (
              <li key={p.id} className={`roster__item${p.isYou ? " roster__item--you" : ""}`}>
                <PlayerBadge colorIndex={p.colorIndex} />
                <span className="roster__name">{p.name}</span>
                {p.isYou && <span className="tag">You</span>}
                {p.isHost && <img className="tag-host" src={`${import.meta.env.BASE_URL}ui/label-host.webp`} alt="Host" width={200} height={114} />}
                {p.isBot && (
                  <span className="tag tag--bot">
                    <Icon name="bot" size={16} /> Bot
                  </span>
                )}
                {p.isBot && isHost && (
                  <button className="roster__remove" onClick={() => roomManager.removeBot(p.id)} aria-label={`Remove bot ${p.name}`}>
                    Remove
                  </button>
                )}
              </li>
            ) : (
              <li key={`empty-${i}`} className="roster__item roster__item--empty">
                Waiting for a wrestler…
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

        {isHost && game.isPrivate && (
          <button className="btn" disabled={full} onClick={() => roomManager.addBot()}>
            {!full && <Icon name="bot" size={22} />}
            {full ? "Room is full" : "Add bot"}
          </button>
        )}

        {!offline && <InviteFriends roomId={session.roomId} />}
        {paid && <p className="hint hint--center">Leave with × before the bout starts to get your entry back.</p>}
    </Dialog>
  );
}

/** Online friends you can invite into this room. */
function InviteFriends({ roomId }: { roomId: string }) {
  const friends = useStore(friendsStore);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!friendsAvailable()) return;
    void loadFriends().catch(() => undefined);
    const timer = window.setInterval(() => void loadFriends().catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const online = friends.data?.friends.filter((f) => f.online) ?? [];
  if (!online.length || !roomId) return null;
  const invite = async (accountId: string, name: string) => {
    try {
      await inviteFriend(accountId, roomId);
      setSent((s) => new Set(s).add(accountId));
      pushToast(`Invite sent to ${name}`, "info");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Couldn't invite.", "error");
    }
  };
  return (
    <section className="lobby__invite" aria-label="Invite friends">
      <h3 className="settings__heading">Invite friends</h3>
      <ul className="friends__list">
        {online.map((f) => (
          <FriendRow key={f.accountId} friend={f}>
            <SmallArt
              art={sent.has(f.accountId) ? "btn-sent" : "btn-invite"}
              label={sent.has(f.accountId) ? `Invite sent to ${f.name}` : `Invite ${f.name}`}
              disabled={sent.has(f.accountId)}
              onClick={() => void invite(f.accountId, f.name)}
            />
          </FriendRow>
        ))}
      </ul>
    </section>
  );
}
