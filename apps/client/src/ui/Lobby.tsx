import { useEffect, useState } from "react";
import { MIN_PLAYERS, Phase } from "@mini-sumo/shared";
import { networkStore } from "../network/networkMode";
import { gameStore, roomManager, sessionStore } from "../network/RoomManager";
import { economyStore } from "../network/economyClient";
import { Coins } from "./Coins";
import { Icon } from "./Icon";
import { Dialog } from "./Dialog";
import { useStore } from "../store";
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

  return (
    <Dialog
      title={game.isPrivate ? "Private room" : (arena?.name ?? "Training Arena")}
      onClose={() => void roomManager.leave()}
      className="lobby"
      overlayClassName="overlay--lobby"
    >
        {!offline && (
          <p className="lobby__sub room-code" aria-label={`Room code ${session.roomId}`}>
            {session.roomId}
          </p>
        )}

        {!offline && (
        <div className="row">
          <button className="btn btn--grow" onClick={() => void copy()}>
            {copied === "link" ? "Invite link copied" : "Copy invite link"}
          </button>
          {"share" in navigator && (
            <button className="btn" onClick={() => void share()}>
              Share
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

        <h2 className="lobby__count">
          Wrestlers {connected.length} of {game.maxPlayers}
        </h2>
        <ul className="roster">
          {slots.map((p, i) =>
            p ? (
              <li key={p.id} className={`roster__item${p.isYou ? " roster__item--you" : ""}`}>
                <PlayerBadge colorIndex={p.colorIndex} />
                <span className="roster__name">{p.name}</span>
                {p.isYou && <span className="tag">You</span>}
                {p.isHost && <span className="tag tag--host">Host</span>}
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

        {autoStart ? null : isHost ? (
          <>
            <button
              className="btn btn--primary btn--big lobby__start"
              disabled={!canStart || !armed}
              onClick={() => roomManager.startMatch()}
              aria-live="polite"
            >
              {searching ? `Start match in ${searchSeconds}…` : "Start match"}
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
        )}

        {paid && <p className="hint hint--center">Leave with × before the bout starts to get your entry back.</p>}
    </Dialog>
  );
}
