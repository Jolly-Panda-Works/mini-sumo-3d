import { useEffect, type ReactNode } from "react";
import { Phase } from "@mini-sumo/shared";
import { GameCanvas } from "./game/GameCanvas";
import { inputController } from "./input/InputController";
import { gameStore, sessionStore } from "./network/RoomManager";
import { settingsStore, touchControlsEnabled } from "./settings";
import { useStore } from "./store";
import { setSettingsOpen, uiStore } from "./uiStore";
import { Countdown } from "./ui/Countdown";
import { HUD } from "./ui/HUD";
import { Lobby } from "./ui/Lobby";
import { MainMenu } from "./ui/MainMenu";
import { NameGate } from "./ui/NameGate";
import { Results } from "./ui/Results";
import { SettingsPanel } from "./ui/SettingsPanel";
import { Toasts } from "./ui/Toasts";
import { TouchControls } from "./ui/TouchControls";

export function App() {
  const session = useStore(sessionStore);
  const game = useStore(gameStore);
  const ui = useStore(uiStore);
  const settings = useStore(settingsStore);
  const inRoom = session.status === "connected" && session.roomId !== "";
  const touch = touchControlsEnabled(settings.touchControls);
  const inBout = game.phase === Phase.Countdown || game.phase === Phase.Playing;

  useEffect(() => {
    if (!inRoom) return;
    inputController.start();
    return () => inputController.stop();
  }, [inRoom]);

  // Escape opens/closes the local settings overlay. It never pauses the shared match.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(!uiStore.get().settingsOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let screen: ReactNode;
  if (!inRoom) {
    screen = <MainMenu />;
  } else if (game.phase === Phase.Waiting || game.phase === Phase.Lobby) {
    screen = <Lobby />;
  } else {
    screen = (
      <>
        <HUD touch={touch} />
        <Countdown />
        {game.phase === Phase.RoundOver && <Results />}
        {touch && inBout && <TouchControls />}
      </>
    );
  }

  return (
    <div className="app">
      <div className="stage">
        <GameCanvas />
      </div>
      <div className="ui">
        {screen}
        {inRoom && <Toasts />}
        {ui.settingsOpen && <SettingsPanel />}
        {!inRoom && !settings.onboarded && <NameGate />}
      </div>
    </div>
  );
}
