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
import { PHONE_QUERY, useMediaQuery } from "../useMediaQuery";

const inviteCode = new URLSearchParams(window.location.search).get("room") ?? "";

/** Home: the hub with an arena carousel on phones; buttons, title and an arena row on wide screens. */
export function MainMenu() {
  const session = useStore(sessionStore);
  const economy = useStore(economyStore);
  const settings = useStore(settingsStore);
  const { mode } = useStore(networkStore);
  const online = mode === "online";
  const balance = economy.profile?.balances.coins;
  const last = economy.lastResult;
  const phone = useMediaQuery(PHONE_QUERY);

  // Invite links open the friends panel once we know the server is there.
  useEffect(() => {
    if (inviteCode && online) setFriendsOpen(true);
  }, [online]);

  const notes = (
    <>
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

    </>
  );
  const error = (
    <>
      {session.error && (
        <p className="notice notice--error home__note" role="alert">
          {session.error}
        </p>
      )}
    </>
  );

  if (!phone) {
    // Wide screens (web, desktop, tablets): buttons on top, the title, all arenas in a row.
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
            <button className="tile-btn" onClick={() => setWardrobeOpen(true)} aria-label="Customise your wrestler">
              <Icon name="customize" size={48} />
            </button>
            <button className="tile-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
              <GearIcon />
            </button>
            <button className="coin-frame" onClick={() => setShopOpen(true)} aria-label={`Coin shop. Balance: ${balance ?? 0} Sumo Coins`}>
              <span className="coin-frame__amount">{(balance ?? 0).toLocaleString("en-US")}</span>
              <Icon name="plus" size={26} className="coin-frame__plus" />
            </button>
          </div>
          <h1 className="home__title">
            <img src={`${import.meta.env.BASE_URL}title.webp`} alt={GAME_TITLE} width={1200} height={621} />
          </h1>
        </header>
        {notes}
        <ArenaRow variant="row" />
        {error}
      </main>
    );
  }

  return (
    <main className="home home--hub">
      <h1 className="visually-hidden">{GAME_TITLE}</h1>
      {/* Top: profile on the left, coins on the right, settings under the coins */}
      <header className="hub__top">
        <button
          className="btn hub__profile"
          onClick={() => setProfileOpen(true)}
          aria-label={`Profile: ${settings.name}, level ${economy.profile?.level.level ?? 1}`}
        >
          <span className="level-badge">{economy.profile?.level.level ?? 1}</span>
          <span className="hub__profile-name">{settings.name}</span>
        </button>
        <button className="coin-frame hub__coins" onClick={() => setShopOpen(true)} aria-label={`Coin shop. Balance: ${balance ?? 0} Sumo Coins`}>
          <span className="coin-frame__amount">{(balance ?? 0).toLocaleString("en-US")}</span>
          <Icon name="plus" size={26} className="coin-frame__plus" />
        </button>
        <button className="tile-btn hub__settings" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <GearIcon />
        </button>
      </header>

      {notes}
      <ArenaRow variant="carousel" />

      {/* Bottom left: customise and shop */}
      <nav className="hub__side" aria-label="More">
        <button className="hub__side-btn" onClick={() => setWardrobeOpen(true)} aria-label="Customise your wrestler">
          <Icon name="customize" size={56} />
          <span>Customise</span>
        </button>
        <button className="hub__side-btn hub__side-btn--shop" onClick={() => setShopOpen(true)} aria-label="Shop">
          <img className="hub__shop-art" src={`${import.meta.env.BASE_URL}ui/shop.webp`} alt="" width={294} height={266} />
        </button>
      </nav>

      {error}
    </main>
  );
}

export function GearIcon() {
  return <Icon name="settings" size={48} />;
}
