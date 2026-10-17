import { useEffect, useState } from "react";
import { DEFAULT_APPEARANCE, Phase } from "@mini-sumo/shared";
import { economyStore, refreshProfile } from "../network/economyClient";
import { localEconomy } from "../network/localEconomy";
import { gameStore, sessionStore, type GameSnapshot, type UIPlayer } from "../network/RoomManager";
import { useStore } from "../store";
import {
  pushToast,
  setAboutOpen,
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
import { Dialog } from "./Dialog";
import { HUD } from "./HUD";
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

type Preview = "lobby" | "hud" | "results-training" | "results-paid" | "welcome";

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
    ui.settingsOpen || ui.profileOpen || ui.wardrobeOpen || ui.shopOpen || ui.walletOpen || ui.aboutOpen || ui.levelUp !== null || ui.notices.length > 0 || preview !== null;
  useEffect(() => {
    if (returnToDev && !somethingOpen && !ui.devOpen) {
      returnToDev = false;
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
          <button className="btn" onClick={show("lobby")}>Waiting room</button>
          <button className="btn" onClick={show("hud")}>Match HUD</button>
          <button className="btn" onClick={show("results-training")}>Results: Training</button>
          <button className="btn" onClick={show("results-paid")}>Results: paid</button>
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
    const savedGame = gameStore.get();
    const savedSession = sessionStore.get();
    const savedResult = economyStore.get().lastResult;
    if (preview === "lobby") gameStore.set(sampleGame(Phase.Lobby, "training"));
    if (preview === "hud") gameStore.set(sampleGame(Phase.Playing, "training"));
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
      gameStore.set(savedGame);
      sessionStore.set(savedSession);
      economyStore.update({ lastResult: savedResult });
    };
  }, [preview]);

  if (!ready) return null;
  return (
    <div className={`dev-preview dev-preview--${preview}`}>
      {preview === "lobby" && <Lobby />}
      {preview === "hud" && <HUD touch={false} />}
      {(preview === "results-training" || preview === "results-paid") && <Results />}
      {preview === "welcome" && <NameGate />}
      <button className="dev-preview__close" onClick={onClose}>
        Close preview
      </button>
    </div>
  );
}
