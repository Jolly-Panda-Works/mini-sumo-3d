import { useState } from "react";
import { MIN_PLAYERS, Phase } from "@mini-sumo/shared";
import { gameStore, roomManager, sessionStore } from "../network/RoomManager";
import { useStore } from "../store";
import { setSettingsOpen } from "../uiStore";
import { GearIcon } from "./MainMenu";
import { PlayerBadge } from "./PlayerBadge";

export function Lobby() {
  const game = useStore(gameStore);
  const session = useStore(sessionStore);
  const [copied, setCopied] = useState<"" | "link" | "failed">("");
  const you = game.players.find((p) => p.isYou);
  const isHost = Boolean(you?.isHost);
  const connected = game.players.filter((p) => p.connected);
  const canStart = isHost && game.phase === Phase.Lobby && connected.length >= MIN_PLAYERS;
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
    <main className="lobby">
      <section className="panel lobby__panel" aria-label="Room lobby">
        <div className="lobby__head">
          <div>
            <p className="field__label">{game.isPrivate ? "Private room" : "Public room"}</p>
            <p className="room-code" aria-label={`Room code ${session.roomId}`}>
              {session.roomId}
            </p>
          </div>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <GearIcon />
          </button>
        </div>

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
        {copied === "failed" && (
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
              </li>
            ) : (
              <li key={`empty-${i}`} className="roster__item roster__item--empty">
                Waiting for a wrestler…
              </li>
            ),
          )}
        </ul>

        {isHost ? (
          <>
            <button className="btn btn--primary btn--big" disabled={!canStart} onClick={() => roomManager.startMatch()}>
              Start match
            </button>
            {!canStart && <p className="hint">You need at least {MIN_PLAYERS} wrestlers. Send the invite link to a friend.</p>}
          </>
        ) : (
          <p className="hint hint--center">Waiting for the host to start the match.</p>
        )}

        <button className="btn btn--ghost" onClick={() => void roomManager.leave()}>
          Leave room
        </button>
      </section>
    </main>
  );
}
