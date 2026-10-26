import { useEffect, useState } from "react";
import { DEFAULT_APPEARANCE, Phase } from "@mini-sumo/shared";
import { economyStore, refreshProfile } from "../network/economyClient";
import { localEconomy } from "../network/localEconomy";
import { gameStore, sessionStore, type GameSnapshot, type UIPlayer } from "../network/RoomManager";
import { useStore } from "../store";
import {
  pushToast,
  setAboutOpen,
  setFriendsOpen,
  setInviteUiOpen,
  setLeaderboardOpen,
  setDevOpen,
  setProfileOpen,
  setSettingsOpen,
  setShopOpen,
  setWalletOpen,
  setWardrobeOpen,
  showError,
  showLevelUp,
  showMessage,
  showWarning,
  uiStore,
} from "../uiStore";
import { devSamples, sampleFriends, sampleLeaderboard, sampleStorePrices } from "./devSamples";
import { Dialog } from "./Dialog";
import { HUD } from "./HUD";
import { Countdown } from "./Countdown";
import { TouchControls } from "./TouchControls";
import { networkStore } from "../network/networkMode";
import { settingsStore } from "../settings";
import { Lobby } from "./Lobby";
import { NameGate } from "./NameGate";
import { Results } from "./Results";

/**
 * Dev mode: opens every panel, popup and match screen with sample data, without playing.
 * Turn it on with ?dev in the address, or by tapping the version label in settings 7 times.
 */
const STORAGE_KEY = "mini-sumo-dev";

export function devEnabled(): boolean {
  try {
    if (new URLSearchParams(location.search).has("dev")) localStorage.setItem(STORAGE_KEY, "1");
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDevEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: dev mode lasts for this session only.
  }
}

/** Floating DEV button (home screen, dev mode only). */
export function DevButton() {
  if (!devEnabled()) return null;
  return (
    <button className="dev-fab" onClick={() => setDevOpen(true)} aria-label="Dev mode">
      DEV
    </button>
  );
}

type Preview =
  | "lobby"
  | "lobby-guest"
  | "lobby-private"
  | "lobby-private-invite"
  | "lobby-paid"
  | "lobby-offline"
  | "count-3"
  | "count-2"
  | "count-1"
  | "count-go"
  | "hud"
  | "hud-touch"
  | "hud-out"
  | "results-training"
  | "results-paid"
  | "results-lose"
  | "results-draw"
  | "server-wait"
  | "welcome";

// ------------------------------------------------------------------ sample data

const NAMES = ["You", "Kenta", "Mika", "Sora"];

function samplePlayers(phase: Phase): UIPlayer[] {
  return NAMES.map((name, i) => ({
    id: `p${i}`,
    name,
    colorIndex: i,
    alive: phase !== Phase.RoundOver || i === 1,
    connected: true,
    placement: phase === Phase.RoundOver ? [2, 1, 3, 4][i]! : 0,
    elimReason: phase === Phase.RoundOver && i !== 1 ? "ring_out" : "",
    dashCooldownMs: i === 0 ? 1200 : 0,
    dashCooldownTotalMs: 3000,
    powerUp: phase === Phase.Playing ? ["iron", "", "wind", ""][i]! : "",
    powerUpMs: phase === Phase.Playing && (i === 0 || i === 2) ? 8400 : 0,
    level: [6, 3, 9, 1][i]!,
    accountId: "",
    isBot: i > 0,
    appearance: { ...DEFAULT_APPEARANCE, hair: i, outfit: i, avatar: [0, 5, 12, 21][i]! },
    isHost: i === 0,
    isYou: i === 0,
  }));
}

function sampleGame(phase: Phase, arenaId: string): GameSnapshot {
  const players = samplePlayers(phase);
  return {
    phase,
    remainingMs: phase === Phase.Playing ? 47_000 : phase === Phase.RoundOver ? 14_000 : 0,
    hostId: "p0",
    winnerId: phase === Phase.RoundOver ? "p1" : "",
    isDraw: false,
    round: 1,
    maxPlayers: 4,
    isPrivate: false,
    aliveCount: players.filter((p) => p.alive).length,
    searchRemainingMs: 0,
    arenaId,
    botLevel: "normal",
    item: null,
    players,
    standings: phase === Phase.RoundOver ? ["p1", "p0", "p2", "p3"] : [],
  };
}

// ------------------------------------------------------------------ panel

/** Set when something was opened from the dev menu: the menu comes back once it closes. */
let returnToDev = false;

export function DevPanel() {
  const ui = useStore(uiStore);
  const [preview, setPreview] = useState<Preview | null>(null);

  // Back to the dev menu when the panel / popup opened from it is closed.
  const somethingOpen =
    ui.settingsOpen || ui.leaderboardOpen || ui.friendsOpen || ui.profileOpen || ui.wardrobeOpen || ui.shopOpen || ui.walletOpen || ui.aboutOpen || ui.levelUp !== null || ui.notices.length > 0 || preview !== null;
  useEffect(() => {
    if (returnToDev && !somethingOpen && !ui.devOpen) {
      returnToDev = false;
      devSamples.set({ leaderboard: null, friends: null, storePrices: null });
      setDevOpen(true);
    }
  }, [somethingOpen, ui.devOpen]);

  if (preview) return <DevPreview preview={preview} onClose={() => setPreview(null)} />;
  if (!ui.devOpen) return null;

  const open = (fn: (open: boolean) => void) => () => {
    returnToDev = true;
    setDevOpen(false);
    fn(true);
  };
  const show = (p: Preview) => () => {
    returnToDev = true;
    setDevOpen(false);
    setPreview(p);
  };
  const tool = (fn: () => void | Promise<void>) => async () => {
    await fn();
    await refreshProfile();
  };

  return (
    <Dialog title="Dev mode" onClose={() => setDevOpen(false)} className="dev-panel">
      <section className="dev-panel__group">
        <h3 className="settings__heading">Panels</h3>
        <div className="dev-panel__grid">
          <button className="btn" onClick={open(setSettingsOpen)}>Settings</button>
          <button className="btn" onClick={open(setProfileOpen)}>Profile</button>
          <button className="btn" onClick={open(setWardrobeOpen)}>Customise</button>
          <button className="btn" onClick={open(setShopOpen)}>Coin shop</button>
          <button className="btn" onClick={open(setWalletOpen)}>Wallet</button>
          <button className="btn" onClick={open(setAboutOpen)}>About</button>
          <button className="btn" onClick={open(setLeaderboardOpen)}>Leaderboard</button>
          <button className="btn" onClick={open(setFriendsOpen)}>Friends</button>
          <button
            className="btn"
            onClick={() => {
              devSamples.update({ leaderboard: sampleLeaderboard() });
              open(setLeaderboardOpen)();
            }}
          >
            Leaderboard (sample)
          </button>
          <button
            className="btn"
            onClick={() => {
              devSamples.update({ friends: sampleFriends() });
              open(setFriendsOpen)();
            }}
          >
            Friends (sample)
          </button>
          <button
            className="btn"
            onClick={() => {
              devSamples.update({ storePrices: sampleStorePrices() });
              open(setShopOpen)();
            }}
          >
            Coin shop (store)
          </button>
          <button className="btn" onClick={show("welcome")}>Welcome</button>
          <button
            className="btn"
            onClick={() => {
              returnToDev = true;
              setDevOpen(false);
              showLevelUp({ from: 3, to: 4, coins: 150 });
            }}
          >
            Level up
          </button>
        </div>
      </section>

      <section className="dev-panel__group">
        <h3 className="settings__heading">Messages</h3>
        <div className="dev-panel__grid">
          <button className="btn" onClick={() => void showMessage("Daily coins", "Your free coins are ready in the shop. Come back tomorrow for more!")}>
            Message
          </button>
          <button
            className="btn"
            onClick={() =>
              void showWarning("Leave the match?", "The bout is still going. If you leave now you lose this bout and your entry fee.", [
                { id: "leave", label: "Leave", primary: true },
                { id: "cancel", label: "Stay" },
              ]).then((choice) => pushToast(`Chose: ${choice}`, "info"))
            }
          >
            Warning
          </button>
          <button
            className="btn"
            onClick={() =>
              void showError("Purchase failed", "Couldn't reach Cafe Bazaar. Check your connection and try again.", [
                { id: "retry", label: "Retry", primary: true },
                { id: "close", label: "Close" },
              ]).then((choice) => pushToast(`Chose: ${choice}`, "info"))
            }
          >
            Error
          </button>
          <button className="btn" onClick={() => pushToast("+150 Sumo Coins", "info")}>Toast</button>
          <button className="btn" onClick={() => pushToast("Couldn't invite: your friend is offline", "error")}>Toast: error</button>
          <button
            className="btn"
            onClick={() => {
              pushToast("Invite sent to Kenta", "info");
              pushToast("+150 Sumo Coins", "info");
              pushToast("Kenta is now your friend", "info");
            }}
          >
            Toasts: several
          </button>
          <button
            className="btn"
            onClick={() =>
              void showMessage("Friend request", "Kenta (level 4) wants to be your friend.", [
                { id: "ok", label: "Accept", primary: true },
                { id: "cancel", label: "Not now" },
              ])
            }
          >
            Friend request
          </button>
          <button className="btn" onClick={() => void showMessage("Room closed", "Kenta left, so the room was closed.")}>
            Room closed
          </button>
          <button
            className="btn"
            onClick={() =>
              void showWarning("Close the room?", "You're the host. If you leave, the room closes and everyone is sent home.", [
                { id: "leave", label: "Leave", primary: true },
                { id: "cancel", label: "Stay" },
              ])
            }
          >
            Close the room?
          </button>
          <button
            className="btn"
            onClick={() =>
              void showWarning("Not enough coins", "You need more Sumo Coins for this. Get some in the coin shop.", [
                { id: "shop", label: "Coin shop", primary: true },
                { id: "cancel", label: "Not now" },
              ])
            }
          >
            Not enough coins
          </button>
          <button
            className="btn"
            onClick={() =>
              void showWarning(
                "Connection lost",
                "The game server can't be reached. You can keep playing against bots; your progress is saved on this device and synced when you're back online.",
              )
            }
          >
            Server unreachable
          </button>
          <button className="btn" onClick={() => void showMessage("Back online", "The game server is reachable again. Your progress has been synced.")}>
            Back online
          </button>
          <button
            className="btn"
            onClick={() => void showError("Connection lost", "You lost the connection to the room. Start a new game, or ask your friend for a new invite.")}
          >
            Room connection lost
          </button>
          <button className="btn" onClick={() => void showError("Couldn't join the game", "The room is full or no longer exists.")}>
            Couldn't join
          </button>
          <button
            className="btn"
            onClick={() =>
              void showMessage("Buy this item?", "Kabuto for 1,500 Sumo Coins.", [{ id: "buy", label: "Buy", primary: true, price: 1500 }], {
                closable: true,
                titleExtra: (
                  <span className="coin-frame coin-frame--static buy-confirm__coins">
                    <span className="coin-frame__amount">7.9k</span>
                  </span>
                ),
                body: (
                  <div className="buy-confirm">
                    <div className="buy-confirm__item">
                      <img className="buy-confirm__avatar" src={`${import.meta.env.BASE_URL}avatars/5.webp`} alt="" width={160} height={160} />
                      <span className="buy-confirm__name">Kabuto</span>
                    </div>
                  </div>
                ),
              })
            }
          >
            Buy this item?
          </button>
          <button
            className="btn"
            onClick={() =>
              void showMessage("Game invite", "Kenta invites you to play. Join the game?", [
                { id: "ok", label: "Join", primary: true },
                { id: "cancel", label: "Not now" },
              ]).then((choice) => pushToast(`Chose: ${choice}`, "info"))
            }
          >
            Game invite
          </button>
        </div>
      </section>

      <section className="dev-panel__group">
        <h3 className="settings__heading">Match screens</h3>
        <div className="dev-panel__grid">
          <button className="btn" onClick={show("lobby")}>Waiting room (host)</button>
          <button className="btn" onClick={show("lobby-guest")}>Waiting room (guest)</button>
          <button className="btn" onClick={show("lobby-private")}>Private room</button>
          <button className="btn" onClick={show("lobby-private-invite")}>Private room: invite</button>
          <button className="btn" onClick={show("lobby-paid")}>Paid arena: searching</button>
          <button className="btn" onClick={show("lobby-offline")}>Waiting room (offline)</button>
          <button className="btn" onClick={show("count-3")}>Countdown 3</button>
          <button className="btn" onClick={show("count-2")}>Countdown 2</button>
          <button className="btn" onClick={show("count-1")}>Countdown 1</button>
          <button className="btn" onClick={show("count-go")}>GO!</button>
          <button className="btn" onClick={show("hud")}>Match HUD</button>
          <button className="btn" onClick={show("hud-touch")}>Match HUD (touch)</button>
          <button className="btn" onClick={show("hud-out")}>Match HUD: players out</button>
          <button className="btn" onClick={show("results-training")}>Results: Training</button>
          <button className="btn" onClick={show("results-paid")}>Results: paid win</button>
          <button className="btn" onClick={show("results-lose")}>Results: lost</button>
          <button className="btn" onClick={show("results-draw")}>Results: draw</button>
          <button className="btn" onClick={() => showLevelUp({ from: 4, to: 5, coins: 175 })}>Level up</button>
          <button className="btn" onClick={show("server-wait")}>Waiting for the server</button>
        </div>
      </section>

      <section className="dev-panel__group">
        <h3 className="settings__heading">Tools</h3>
        <div className="dev-panel__grid">
          <button className="btn" onClick={tool(() => localEconomy.devAddCoins(1000))}>+1,000 coins</button>
          <button
            className="btn"
            onClick={tool(() => {
              const { from, to } = localEconomy.devAddXp(500);
              if (to > from) showLevelUp({ from, to, coins: 0 });
            })}
          >
            +500 XP
          </button>
          <button className="btn" onClick={tool(() => localEconomy.devResetDailyGift())}>Reset daily coins</button>
          <button
            className="btn"
            onClick={() => {
              setDevEnabled(false);
              setDevOpen(false);
              pushToast("Dev mode off", "info");
            }}
          >
            Turn dev mode off
          </button>
        </div>
      </section>
    </Dialog>
  );
}

// ------------------------------------------------------------------ previews

/**
 * Shows a match screen with sample data. The real game and session state are swapped out
 * while it's open and put back on close.
 */
function DevPreview({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const savedGame = gameStore.get();
    const savedSession = sessionStore.get();
    const savedResult = economyStore.get().lastResult;
    const savedNetwork = networkStore.get();
    const savedJoystick = settingsStore.get().joystick;
    const lobby = (arenaId: string, patch: Partial<GameSnapshot> = {}, count = 4) => {
      const g = sampleGame(Phase.Lobby, arenaId);
      gameStore.set({ ...g, players: g.players.slice(0, count), aliveCount: count, ...patch });
    };
    if (preview === "lobby") lobby("training");
    if (preview === "lobby-guest") {
      const g = sampleGame(Phase.Lobby, "training");
      gameStore.set({ ...g, hostId: "p1", players: g.players.map((p) => ({ ...p, isHost: p.id === "p1" })) });
    }
    if (preview === "lobby-private") lobby("private", { isPrivate: true }, 2);
    if (preview === "lobby-private-invite") {
      lobby("private", { isPrivate: true }, 2);
      setInviteUiOpen(true);
    }
    if (preview === "lobby-paid") lobby("rookie", { searchRemainingMs: 7_000 }, 1);
    if (preview === "lobby-offline") {
      networkStore.set({ mode: "offline" });
      lobby("training", {}, 1);
    }
    if (preview === "count-3" || preview === "count-2" || preview === "count-1") {
      const n = Number(preview.slice(-1));
      gameStore.set({ ...sampleGame(Phase.Countdown, "training"), remainingMs: n * 1000 - 300 });
    }
    if (preview === "count-go") {
      // GO shows when the countdown turns into the bout: replay it every 1.5 s.
      const g = sampleGame(Phase.Countdown, "training");
      gameStore.set({ ...g, remainingMs: 500 });
      const loop = window.setInterval(() => {
        gameStore.set({ ...g, remainingMs: 500 });
        window.setTimeout(() => gameStore.set({ ...g, phase: Phase.Playing, remainingMs: 60_000 }), 60);
      }, 1500);
      cleanups.push(() => window.clearInterval(loop));
    }
    if (preview === "hud" || preview === "hud-touch") gameStore.set(sampleGame(Phase.Playing, "training"));
    if (preview === "hud-touch") settingsStore.update({ joystick: "fixed" });
    if (preview === "hud-out") {
      const g = sampleGame(Phase.Playing, "training");
      gameStore.set({
        ...g,
        players: g.players.map((p, i) => (i === 2 || i === 3 ? { ...p, alive: false, elimReason: i === 2 ? "ring_out" : "left" } : p)),
        aliveCount: 2,
      });
    }
    if (preview === "results-lose" || preview === "results-draw") {
      gameStore.set(
        preview === "results-draw" ? { ...sampleGame(Phase.RoundOver, "training"), winnerId: "", isDraw: true } : sampleGame(Phase.RoundOver, "training"),
      );
      economyStore.update({
        lastResult: { kind: "rewarded", arenaId: "training", entryFee: 0, prize: 0, economyFee: 0, rewards: 0, balance: null, note: "", xp: 20 },
      });
    }
    if (preview === "server-wait") networkStore.set({ mode: "checking" });
    if (preview === "results-training") {
      gameStore.set(sampleGame(Phase.RoundOver, "training"));
      economyStore.update({
        lastResult: { kind: "rewarded", arenaId: "training", entryFee: 0, prize: 0, economyFee: 0, rewards: 0, balance: null, note: "", xp: 20 },
      });
    }
    if (preview === "results-paid") {
      gameStore.set({ ...sampleGame(Phase.RoundOver, "rookie"), winnerId: "p0", standings: ["p0", "p1", "p2", "p3"] });
      economyStore.update({
        lastResult: { kind: "settled", arenaId: "rookie", entryFee: 50, prize: 180, economyFee: 20, rewards: 0, balance: 330, note: "", xp: 75 },
      });
    }
    setReady(true);
    return () => {
      for (const done of cleanups) done();
      setInviteUiOpen(false);
      networkStore.set(savedNetwork);
      settingsStore.update({ joystick: savedJoystick });
      gameStore.set(savedGame);
      sessionStore.set(savedSession);
      economyStore.update({ lastResult: savedResult });
    };
  }, [preview]);

  if (!ready) return null;
  return (
    <div className={`dev-preview dev-preview--${preview}`}>
      {preview.startsWith("lobby") && <Lobby />}
      {(preview === "hud" || preview === "hud-out") && <HUD touch={false} />}
      {preview === "hud-touch" && (
        <>
          <HUD touch />
          <TouchControls />
        </>
      )}
      {preview.startsWith("count-") && <Countdown />}
      {preview.startsWith("results-") && <Results />}
      {/* server-wait: the app's own waiting screen shows (the preview only sets "checking") */}
      {preview === "welcome" && <NameGate />}
      <button className="dev-preview__close" onClick={onClose}>
        Close preview
      </button>
    </div>
  );
}
