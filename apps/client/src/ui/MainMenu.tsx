import { useEffect } from "react";
import { GAME_TITLE } from "../config";
import { economyStore } from "../network/economyClient";
import { networkStore } from "../network/networkMode";
import { sessionStore } from "../network/RoomManager";
import { useStore } from "../store";
import { setFriendsOpen, setProfileOpen, setSettingsOpen, setShopOpen, setWardrobeOpen } from "../uiStore";
import { settingsStore } from "../settings";
import { ArenaRow } from "./ArenaSelect";
import { Coins } from "./Coins";
import { Icon } from "./Icon";

const inviteCode = new URLSearchParams(window.location.search).get("room") ?? "";

/** Home: title, the arenas side by side, free training and friends. */
export function MainMenu() {
  const session = useStore(sessionStore);
  const economy = useStore(economyStore);
  const settings = useStore(settingsStore);
  const { mode } = useStore(networkStore);
  const online = mode === "online";
  const balance = economy.profile?.balances.coins;
  const last = economy.lastResult;

  // Invite links open the friends panel once we know the server is there.
  useEffect(() => {
    if (inviteCode && online) setFriendsOpen(true);
  }, [online]);

  return (
    <main className="home">
      <header className="home__top">
        <div className="home__actions">
          <button
            className="btn home__profile"
            onClick={() => setProfileOpen(true)}
            aria-label={`Profile: ${settings.name}, level ${economy.profile?.level.level ?? 1}`}
          >
            <span className="home__profile-name">{settings.name}</span>
            <span className="home__profile-level">
              Level <span className="level-badge">{economy.profile?.level.level ?? 1}</span>
            </span>
          </button>
          <button className="icon-btn" onClick={() => setWardrobeOpen(true)} aria-label="Customise your wrestler">
            <Icon name="customize" size={30} />
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <GearIcon />
          </button>
          <button className="btn home__coins" onClick={() => setShopOpen(true)} aria-label={`Coin shop. Balance: ${balance ?? 0} Sumo Coins`}>
            <Coins amount={balance ?? 0} />
            <Icon name="plus" size={22} className="home__coins-plus" />
          </button>
        </div>
        <h1 className="home__title">
          <img src={`${import.meta.env.BASE_URL}title.webp`} alt={GAME_TITLE} width={1200} height={621} />
        </h1>
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

      {session.error && (
        <p className="notice notice--error home__note" role="alert">
          {session.error}
        </p>
      )}
    </main>
  );
}

export function GearIcon() {
  return <Icon name="settings" size={30} />;
}
