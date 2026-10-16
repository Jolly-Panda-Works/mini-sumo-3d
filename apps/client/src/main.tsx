import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { audio } from "./audio/AudioManager";
// The game font is bundled with the app (no font requests to other sites).
import "@fontsource/baloo-2/500.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/baloo-2/800.css";
import "./styles.css";
import { bootTrack, preloadImage, startBoot } from "./boot";
import { roomManager } from "./network/RoomManager";
import { music } from "./audio/Music";
import { initPlayGames } from "./network/playGames";

// Loading screen: artwork, fonts, the server check and the first 3D frame.
const base = import.meta.env.BASE_URL;
const images = ["title.webp", "logo.webp", "ui/frame.webp", "ui/header.webp", "ui/close.webp", "ui/bg-tile.webp", "ui/coin-frame.webp", "ui/shop.webp", "ui/timer-frame.webp", "ui/play-again.webp", "ui/reward-panel.webp", ...["training", "rookie", "pro", "champion"].map((id) => `arenas/${id}.webp`), ...["iron", "thunder", "wind", "giant"].flatMap((k) => [`powerups/${k}-coin.webp`, `powerups/${k}-flag.webp`])];
images.forEach((file) => bootTrack(`img:${file}`, 1, preloadImage(`${base}${file}`)));
bootTrack("fonts", 1, document.fonts?.ready ?? Promise.resolve());
bootTrack("network", 2, roomManager.ready);
bootTrack("music", 2, music.preload("menu"));
bootTrack("sfx", 1, audio.preloadSamples());
// Google Play Games (Android app): automatic sign-in and cloud save, once the economy is ready.
void roomManager.ready.then(() => initPlayGames());
startBoot();

// Art used from CSS (set here so the URLs follow the app's base path).
document.documentElement.style.setProperty("--ui-frame", `url("${base}ui/frame.webp")`);
document.documentElement.style.setProperty("--ui-bg-tile", `url("${base}ui/bg-tile.webp")`);
for (const [name, file] of [
  ["coin-frame", "coin-frame"],
  ["timer-frame", "timer-frame"],
  ["reward-panel", "reward-panel"],
] as const) {
  document.documentElement.style.setProperty(`--ui-${name}`, `url("${base}ui/${file}.webp")`);
}

// Browsers only allow audio after a user gesture.
const unlockAudio = () => audio.unlock();
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
