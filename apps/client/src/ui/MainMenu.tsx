import { useEffect } from "react";
import { GAME_TITLE } from "../config";
import { economyStore } from "../network/economyClient";
import { networkStore } from "../network/networkMode";
import { roomManager, sessionStore } from "../network/RoomManager";
import { useStore } from "../store";
import { pushToast, showError, setFriendsOpen, setLeaderboardOpen, setProfileOpen, setSettingsOpen, setShopOpen, setWardrobeOpen } from "../uiStore";
import { settingsStore } from "../settings";
import { ArenaRow } from "./ArenaSelect";
import { Icon } from "./Icon";
import { avatarSrc } from "./Avatar";
import { PHONE_QUERY, useMediaQuery } from "../useMediaQuery";

/** Connection errors already shown. */
const shownErrors = new Set<string>();

/** Bout results already announced (so the toast shows once). */
const toastedResults = new WeakSet<object>();

// A private room's invite link (?room=…): joined once the server is reachable, then the
// address is cleaned up.
const inviteCode = new URLSearchParams(window.location.search).get("room") ?? "";
let inviteHandled = false;
if (inviteCode) {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
}

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

  // After a bout: one short notification on the way home, then it's gone.
  useEffect(() => {
    if (!last || toastedResults.has(last)) return;
    toastedResults.add(last);
    const won = last.prize + last.rewards + (last.levelReward ?? 0);
    if (won > 0) pushToast(`+${won.toLocaleString("en-US")} Sumo Coins`, "info", 3000);
    else if (last.note) pushToast(last.note, "info", 3000);
  }, [last]);

  useEffect(() => {
    if (inviteCode && online && !inviteHandled) {
      inviteHandled = true;
      void roomManager.joinByCode(inviteCode, settingsStore.get().name);
    }
  }, [online]);

  // Connection errors: an error popup (once per error) instead of a note in the layout.
  useEffect(() => {
    if (!session.error || shownErrors.has(session.error)) return;
    shownErrors.add(session.error);
    void showError("Couldn't connect", session.error);
  }, [session.error]);
  const error = null;

  if (!phone) {
    // Wide screens (web, desktop, tablets): buttons on top, the title, all arenas in a row.
    return (
      <main className="home">
        <header className="home__top">
          <div className="home__actions">
            <ProfileCard className="home__profile-card" />
            <button className="tile-btn tile-btn--leaderboard" onClick={() => setLeaderboardOpen(true)} aria-label="Leaderboard">
              <svg className="hub__trophy-art" viewBox="0 0 64 64" aria-hidden="true">
                <rect x="2" y="2" width="60" height="60" rx="10" fill="#7a4a24" stroke="#3a1d05" strokeWidth="3" />
                <rect x="8" y="8" width="48" height="48" rx="6" fill="#5b2a86" />
                <path d="M20 16h24v8c0 9-5 15-12 15s-12-6-12-15z" fill="#f2b21e" stroke="#3a1d05" strokeWidth="2.5" />
                <path d="M20 19h-6c0 6 3 10 8 10M44 19h6c0 6-3 10-8 10" fill="none" stroke="#3a1d05" strokeWidth="2.5" />
                <rect x="29" y="38" width="6" height="7" fill="#f2b21e" stroke="#3a1d05" strokeWidth="2" />
                <rect x="22" y="45" width="20" height="6" rx="2" fill="#c47f12" stroke="#3a1d05" strokeWidth="2" />
              </svg>
            </button>
            <button className="art art--friends-wide" onClick={() => setFriendsOpen(true)} aria-label="Friends">
              <img src={`${import.meta.env.BASE_URL}ui/friends-wide.webp`} alt="" width={360} height={111} />
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
        <ProfileCard className="hub__profile" />
        <button className="coin-frame hub__coins" onClick={() => setShopOpen(true)} aria-label={`Coin shop. Balance: ${balance ?? 0} Sumo Coins`}>
          <span className="coin-frame__amount">{(balance ?? 0).toLocaleString("en-US")}</span>
          <Icon name="plus" size={26} className="coin-frame__plus" />
        </button>
        {/* Friends under the profile (settings is under the coins) */}
        <button className="tile-btn hub__friends" onClick={() => setFriendsOpen(true)} aria-label="Friends">
          <img src={`${import.meta.env.BASE_URL}ui/friends-icon.webp`} alt="" width={216} height={221} />
        </button>
        <button className="tile-btn hub__settings" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <GearIcon />
        </button>
      </header>

      <ArenaRow variant="carousel" />

      {/* Bottom left: customise and shop */}
      <nav className="hub__side" aria-label="More">
        <button className="hub__side-btn" onClick={() => setWardrobeOpen(true)} aria-label="Customise your wrestler">
          <Icon name="customize" size={56} />
          <span>Customise</span>
        </button>
        <button className="hub__side-btn hub__side-btn--leaderboard" onClick={() => setLeaderboardOpen(true)} aria-label="Leaderboard">
          <svg className="hub__trophy-art" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="2" y="2" width="60" height="60" rx="10" fill="#7a4a24" stroke="#3a1d05" strokeWidth="3" />
            <rect x="8" y="8" width="48" height="48" rx="6" fill="#5b2a86" />
            <path d="M20 16h24v8c0 9-5 15-12 15s-12-6-12-15z" fill="#f2b21e" stroke="#3a1d05" strokeWidth="2.5" />
            <path d="M20 19h-6c0 6 3 10 8 10M44 19h6c0 6-3 10-8 10" fill="none" stroke="#3a1d05" strokeWidth="2.5" />
            <rect x="29" y="38" width="6" height="7" fill="#f2b21e" stroke="#3a1d05" strokeWidth="2" />
            <rect x="22" y="45" width="20" height="6" rx="2" fill="#c47f12" stroke="#3a1d05" strokeWidth="2" />
          </svg>
          <span>Leaderboard</span>
        </button>
        <button className="hub__side-btn hub__side-btn--shop" onClick={() => setShopOpen(true)} aria-label="Shop">
          <img className="hub__shop-art" src={`${import.meta.env.BASE_URL}ui/shop.webp`} alt="" width={360} height={335} />
          <span>Shop</span>
        </button>
      </nav>

      {error}
    </main>
  );
}

export function GearIcon() {
  return <Icon name="settings" size={48} />;
}

/** The profile frame on the home screen: picture, name and level; opens the profile. */
function ProfileCard({ className = "" }: { className?: string }) {
  const settings = useStore(settingsStore);
  const economy = useStore(economyStore);
  const level = economy.profile?.level.level ?? 1;
  return (
    <button className={`profile-card ${className}`} onClick={() => setProfileOpen(true)} aria-label={`Profile: ${settings.name}, level ${level}`}>
      <img className="profile-card__avatar" src={avatarSrc(settings.appearance.avatar)} alt="" width={160} height={160} />
      <span className="profile-card__name">{settings.name}</span>
      <span className="profile-card__level">{level}</span>
    </button>
  );
}
