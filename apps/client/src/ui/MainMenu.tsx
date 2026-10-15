import { useEffect } from "react";
import { GAME_TITLE } from "../config";
import { economyStore } from "../network/economyClient";
import { networkStore } from "../network/networkMode";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setFriendsOpen, setHomeArena, setSettingsOpen, setWalletOpen, setWardrobeOpen } from "../uiStore";
import { ArenaRow } from "./ArenaSelect";
import { Coins } from "./Coins";

const inviteCode = new URLSearchParams(window.location.search).get("room") ?? "";

/** Home: title, the arenas side by side, free training and friends. */
export function MainMenu() {
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const economy = useStore(economyStore);
  const { mode } = useStore(networkStore);
  const online = mode === "online";
  const busy = session.status === "connecting";
  const balance = economy.profile?.balances.coins;
  const last = economy.lastResult;

  // Invite links open the friends panel once we know the server is there.
  useEffect(() => {
    if (inviteCode && online) setFriendsOpen(true);
  }, [online]);

  return (
    <main className="home">
      <header className="home__top">
        <h1 className="home__title">{GAME_TITLE}</h1>
        <div className="home__actions">
          {balance !== undefined && (
            <button className="btn home__coins" onClick={() => setWalletOpen(true)} aria-label={`Wallet: ${balance} Sumo Coins`}>
              <Coins amount={balance} />
            </button>
          )}
          <button className="icon-btn" onClick={() => setWardrobeOpen(true)} aria-label="Customise your wrestler">
            <HangerIcon />
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </header>

      {last && (last.kind !== "rewarded" || last.rewards > 0) && (
        <p className="notice notice--result home__note" role="status">
          {last.kind === "settled" && last.prize > 0 ? (
            <>
              Last bout: you won <Coins amount={last.prize} />!
            </>
          ) : last.kind === "rewarded" ? (
            <>
              Last bout: <Coins amount={last.rewards} signed /> reward.
            </>
          ) : (
            <>Last bout: {last.note}</>
          )}
        </p>
      )}

      <ArenaRow />

      <div className="home__bottom">
        <button
          className="btn btn--primary btn--big home__training"
          disabled={busy}
          onPointerEnter={() => setHomeArena("training")}
          onFocus={() => setHomeArena("training")}
          onClick={() => void roomManager.quickPlay(settings.name)}
        >
          {busy ? "Finding a room…" : "Training"}
          <span className="home__sub">Free practice bout</span>
        </button>
        <button className="btn btn--big" disabled={!online || busy} onClick={() => setFriendsOpen(true)}>
          Play with friends
          {!online && <span className="tag tag--soon">Coming soon</span>}
        </button>
      </div>

      {session.error && (
        <p className="notice notice--error home__note" role="alert">
          {session.error}
        </p>
      )}
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

function HangerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6.5a2 2 0 1 1 3 1.7c-.6.4-1 .9-1 1.6V11l8.5 5.2c.9.6.5 1.8-.6 1.8H4.1c-1.1 0-1.5-1.2-.6-1.8L12 11"
      />
    </svg>
  );
}
