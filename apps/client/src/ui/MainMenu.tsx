import { useState, type FormEvent } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setSettingsOpen } from "../uiStore";

const inviteCode = new URLSearchParams(window.location.search).get("room") ?? "";

export function MainMenu() {
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const [code, setCode] = useState(inviteCode);
  const [maxPlayers, setMaxPlayers] = useState(MAX_PLAYERS);
  const busy = session.status === "connecting";
  const name = settings.name;

  const setName = (value: string) => settingsStore.update({ name: value.slice(0, NAME_MAX_LENGTH) });

  const join = (event: FormEvent) => {
    event.preventDefault();
    void roomManager.joinByCode(code, name);
  };

  return (
    <main className="menu">
      <header className="menu__title">
        <h1 className="logo">
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}logo.webp`} type="image/webp" />
            <img className="logo__img" src={`${import.meta.env.BASE_URL}logo.png`} alt="Mini Sumo" width={768} height={768} decoding="async" />
          </picture>
        </h1>
        <p className="menu__tagline">Push your friends out of the ring. Last one standing wins.</p>
      </header>

      <section className="panel menu__panel" aria-label="Start playing">
        {inviteCode && (
          <p className="notice notice--invite">
            You were invited to room <strong>{inviteCode}</strong>. Pick a name and join.
          </p>
        )}

        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Little Yokozuna"
            maxLength={NAME_MAX_LENGTH}
            autoComplete="nickname"
            enterKeyHint="go"
          />
        </label>

        {!inviteCode && (
          <button className="btn btn--primary btn--big" disabled={busy} onClick={() => void roomManager.quickPlay(name)}>
            {busy ? "Connecting…" : "Play now"}
          </button>
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
              autoFocus={Boolean(inviteCode)}
            />
          </label>
          <button type="submit" className={`btn ${inviteCode ? "btn--primary" : ""}`} disabled={busy || code.length === 0}>
            {inviteCode && busy ? "Joining…" : "Join room"}
          </button>
        </form>

        <div className="row row--split">
          <label className="field">
            <span className="field__label">Private room size</span>
            <select className="input" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
                <option key={n} value={n}>
                  {n} players
                </option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy} onClick={() => void roomManager.createPrivate(name, maxPlayers)}>
            Create private room
          </button>
        </div>

        {session.error && (
          <p className="notice notice--error" role="alert">
            {session.error}
          </p>
        )}
      </section>

      <button className="icon-btn menu__settings" onClick={() => setSettingsOpen(true)} aria-label="Settings">
        <GearIcon />
      </button>
    </main>
  );
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.3-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
        transform="translate(-1 0)"
      />
    </svg>
  );
}
