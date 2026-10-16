import { useState, type FormEvent } from "react";
import { MAX_PLAYERS, MIN_PLAYERS } from "@mini-sumo/shared";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setFriendsOpen } from "../uiStore";
import { Dialog } from "./Dialog";

const inviteCode = new URLSearchParams(window.location.search).get("room") ?? "";

/** Private rooms: create one and share the link, or join with a code. Online only. */
export function FriendsPanel() {
  const session = useStore(sessionStore);
  const { name } = useStore(settingsStore);
  const [code, setCode] = useState(inviteCode);
  const [maxPlayers, setMaxPlayers] = useState(MAX_PLAYERS);
  const busy = session.status === "connecting";

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (await roomManager.joinByCode(code, name)) setFriendsOpen(false);
  };

  const create = async () => {
    if (await roomManager.createPrivate(name, maxPlayers)) setFriendsOpen(false);
  };

  return (
    <Dialog title="Play with friends" onClose={() => setFriendsOpen(false)} className="friends">
        {inviteCode && (
          <p className="notice notice--invite">
            You were invited to room <strong>{inviteCode}</strong>.
          </p>
        )}
        <form className="row" onSubmit={join}>
          <label className="field field--grow">
            <span className="field__label">Room code</span>
            <input
              className="input input--code"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="Paste a code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="btn btn--primary" disabled={busy || code.length === 0}>
            Join room
          </button>
        </form>
        <div className="row row--split">
          <label className="field">
            <span className="field__label">Room size</span>
            <select className="input" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
                <option key={n} value={n}>
                  {n} players
                </option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy} onClick={() => void create()}>
            Create private room
          </button>
        </div>
        <p className="hint">Private rooms are free and give no coins. Share the invite link from the lobby.</p>
        {session.error && (
          <p className="notice notice--error" role="alert">
            {session.error}
          </p>
        )}
    </Dialog>
  );
}
