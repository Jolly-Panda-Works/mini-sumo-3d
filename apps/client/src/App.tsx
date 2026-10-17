import { useEffect, type ReactNode } from "react";
import { LATE_GAME_MS, Phase } from "@mini-sumo/shared";
import { GameCanvas } from "./game/GameCanvas";
import { HomeBackground } from "./ui/HomeBackground";
import { inputController } from "./input/InputController";
import { gameStore, sessionStore } from "./network/RoomManager";
import { settingsStore, touchControlsEnabled } from "./settings";
import { useStore } from "./store";
import { setAboutOpen, setFriendsOpen, setProfileOpen, setSettingsOpen, setShopOpen, setWalletOpen, setWardrobeOpen, uiStore } from "./uiStore";
import { Countdown } from "./ui/Countdown";
import { HUD } from "./ui/HUD";
import { Lobby } from "./ui/Lobby";
import { MainMenu } from "./ui/MainMenu";
import { NameGate } from "./ui/NameGate";
import { Wardrobe } from "./ui/Wardrobe";
import { AboutPanel } from "./ui/AboutPanel";
import { FriendsPanel } from "./ui/FriendsPanel";
import { CoinShop } from "./ui/CoinShop";
import { LevelUpPopup } from "./ui/LevelUpPopup";
import { DevButton, DevPanel } from "./ui/DevPanel";
import { NoticePopup } from "./ui/NoticePopup";
import { ServerWait } from "./ui/ServerWait";
import { InviteWatcher } from "./ui/InviteWatcher";
import { audio } from "./audio/AudioManager";
import { ProfilePanel } from "./ui/ProfilePanel";
import { music } from "./audio/Music";
import { Wallet } from "./ui/Wallet";
import { Results } from "./ui/Results";
import { SettingsPanel } from "./ui/SettingsPanel";
import { Toasts } from "./ui/Toasts";
import { TouchControls } from "./ui/TouchControls";
import { OutActions } from "./ui/OutActions";

export function App() {
  const session = useStore(sessionStore);
  const game = useStore(gameStore);
  const ui = useStore(uiStore);
  const settings = useStore(settingsStore);
  const inRoom = session.status === "connected" && session.roomId !== "";
  const touch = touchControlsEnabled(settings.touchControls);
  const inBout = game.phase === Phase.Countdown || game.phase === Phase.Playing;
  const inLobby = inRoom && (game.phase === Phase.Waiting || game.phase === Phase.Lobby);
  const youOut = game.phase === Phase.Playing && game.players.some((p) => p.isYou && !p.alive);

  useEffect(() => {
    if (!inRoom) return;
    inputController.start();
    return () => inputController.stop();
  }, [inRoom]);

  // Background music: calm on menus and in the lobby, driving during a bout,
  // and a little faster in the final 30 seconds.
  useEffect(() => {
    music.setMode(inRoom && inBout ? "bout" : "menu");
  }, [inRoom, inBout]);
  const finalStretch = inRoom && game.phase === Phase.Playing && game.remainingMs > 0 && game.remainingMs <= LATE_GAME_MS;
  useEffect(() => {
    music.setTempo(finalStretch ? 1.1 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalStretch]);

  // Button sounds: a click for every button, a "no" for buttons that can't be used yet
  // (aria-disabled, which also explain why). Buttons with their own sound opt out with
  // data-sfx="none".
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const button = (e.target as HTMLElement | null)?.closest?.("button");
      if (!button) return;
      // Rejected tap (disabled or not available yet): a short shake.
      if (button.disabled || button.getAttribute("aria-disabled") === "true") {
        button.classList.remove("is-rejected");
        void button.offsetWidth;
        button.classList.add("is-rejected");
        window.setTimeout(() => button.classList.remove("is-rejected"), 420);
      }
      if (button.disabled || button.dataset.sfx === "none") return;
      if (button.getAttribute("aria-disabled") === "true") audio.reject();
      else audio.click();
    };
    // Touch screens: :active is too brief to see, so a press class stays for a moment.
    const onDown = (e: PointerEvent) => {
      const button = (e.target as HTMLElement | null)?.closest?.("button");
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
      button.classList.add("is-pressed");
      const started = performance.now();
      const release = () => {
        const left = Math.max(0, 140 - (performance.now() - started));
        window.setTimeout(() => button.classList.remove("is-pressed"), left);
        window.removeEventListener("pointerup", release, true);
        window.removeEventListener("pointercancel", release, true);
      };
      window.addEventListener("pointerup", release, true);
      window.addEventListener("pointercancel", release, true);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, []);

  // The wardrobe is a lobby-only screen: close it when a bout starts.
  useEffect(() => {
    if (inBout) setWardrobeOpen(false);
  }, [inBout]);

  // Escape opens/closes the local settings overlay. It never pauses the shared match.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !settingsStore.get().onboarded) return;
      if (uiStore.get().wardrobeOpen) setWardrobeOpen(false);
      else if (uiStore.get().walletOpen) setWalletOpen(false);
      else if (uiStore.get().profileOpen) setProfileOpen(false);
      else if (uiStore.get().shopOpen) setShopOpen(false);
      else if (uiStore.get().aboutOpen) setAboutOpen(false);
      else if (uiStore.get().friendsOpen) setFriendsOpen(false);
      else if (uiStore.get().settingsOpen) setSettingsOpen(false);
      else {
        // No settings while waiting for a match to start.
        const phase = gameStore.get().phase;
        const waiting = sessionStore.get().roomId !== "" && (phase === Phase.Waiting || phase === Phase.Lobby);
        if (!waiting) setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needsName = !inRoom && !settings.onboarded;

  let screen: ReactNode;
  if (needsName) {
    // First launch: only the name prompt, nothing behind it.
    screen = <NameGate />;
  } else if (!inRoom) {
    screen = <MainMenu />;
  } else if (game.phase === Phase.Waiting || game.phase === Phase.Lobby) {
    screen = <Lobby />;
  } else {
    screen = (
      <>
        <HUD touch={touch} />
        <Countdown />
        {game.phase === Phase.RoundOver && <Results />}
        {inBout && youOut ? <OutActions /> : touch && inBout && <TouchControls />}
      </>
    );
  }

  return (
    <div className="app">
      {/* The 3D arena is the match environment: only mounted in a room. Home has its own backdrop. */}
      <div className="stage">{inRoom ? <GameCanvas /> : <HomeBackground />}</div>
      <div className="ui">
        {screen}
        {inRoom && <Toasts />}
        {ui.wardrobeOpen && !needsName && (!inRoom || game.phase === Phase.Waiting || game.phase === Phase.Lobby) && <Wardrobe />}
        {ui.friendsOpen && !inRoom && !needsName && <FriendsPanel />}
        {ui.profileOpen && !needsName && <ProfilePanel />}
        {ui.shopOpen && !needsName && <CoinShop />}
        {ui.walletOpen && !needsName && <Wallet />}
        {ui.settingsOpen && !needsName && !inLobby && <SettingsPanel />}
        {ui.aboutOpen && <AboutPanel />}
        {ui.levelUp && <LevelUpPopup />}
        <DevPanel />
        {!inRoom && !needsName && <DevButton />}
        <NoticePopup />
        <ServerWait />
        <InviteWatcher />
      </div>
    </div>
  );
}
