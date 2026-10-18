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
import { startScrollFade } from "./ui/scrollFade";
import { roomManager } from "./network/RoomManager";
import { music } from "./audio/Music";
import { initPlayGames } from "./network/playGames";

// Loading screen: artwork, fonts, the server check and the first 3D frame.
const base = import.meta.env.BASE_URL;
const images = ["title.webp", "logo.webp", "ui/frame.webp", "ui/header.webp", "ui/close.webp", "ui/bg-tile.webp", "ui/coin-frame.webp", "ui/icon-shop.webp", "ui/icon-settings.webp", "ui/profile-frame.webp", "ui/timer-circle.webp", "ui/powerup-frame.webp", "ui/results-board.webp", "ui/arena-panel.webp", "ui/btn-enter.webp", "ui/popup-sub.webp", "ui/welcome-frame.webp", "ui/friends-icon.webp", "ui/icon-leaderboard.webp", "ui/popup-message.webp", "ui/popup-warning.webp", "ui/popup-error.webp", ...["ok", "leave", "stay", "shop", "not-now", "retry", "close"].map((n) => `ui/notice-${n}.webp`), "ui/btn-leave.webp", "ui/btn-great.webp", "ui/reward-coin.webp", "ui/reward-xp.webp", "ui/label-level.webp", "ui/levelup-frame.webp", "ui/btn-about.webp", "ui/btn-buy.webp", "ui/btn-not-now.webp", "ui/btn-coming-soon.webp", "ui/label-free.webp", "ui/vibration-frame.webp", "ui/vibration-on.webp", "ui/vibration-off.webp", "ui/btn-play.webp", "ui/btn-home.webp", "ui/btn-rematch.webp", "ui/btn-play-again.webp", ...["red", "blue", "green", "yellow"].map((c) => `hud/player-${c}.webp`), ...["dash", "count-3", "count-2", "count-1", "go", "joy-base", "joy-knob", "out"].map((n) => `hud/${n}.webp`), ...["private", "training", "rookie", "amateur", "pro", "veteran", "champion", "master", "legend", "godlike"].map((id) => `arenas/${id}.webp`), ...["iron", "thunder", "wind", "giant"].flatMap((k) => [`powerups/${k}-coin.webp`, `powerups/${k}-flag.webp`])];
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
  ["profile-frame", "profile-frame"],
  ["timer-circle", "timer-circle"],
  ["powerup-frame", "powerup-frame"],
  ["results-board", "results-board"],
  ["arena-panel", "arena-panel"],
  ["label-version", "label-version"],
  ["label-level", "label-level"],
  ["label-empty", "label-empty"],
  ["btn-start", "btn-start"],
  ["levelup-frame", "levelup-frame"],
  ["reward-coin", "reward-coin"],
  ["reward-xp", "reward-xp"],
  ["popup-sub", "popup-sub"],
  ["input-field", "input-field"],
  ["welcome-frame", "welcome-frame"],
  ["edit-name-frame", "edit-name-frame"],
  ["friend-code", "friend-code"],
  ["friend-card", "friend-card"],
  ["lb-panel", "lb-panel"],
  ["frame-common", "rarity/frame-common"],
  ["frame-on-common", "rarity/frame-on-common"],
  ["frame-rare", "rarity/frame-rare"],
  ["frame-on-rare", "rarity/frame-on-rare"],
  ["frame-epic", "rarity/frame-epic"],
  ["frame-on-epic", "rarity/frame-on-epic"],
  ["frame-legendary", "rarity/frame-legendary"],
  ["frame-on-legendary", "rarity/frame-on-legendary"],
  ["audio-back", "slider/audio-back"],
  ["audio-fill", "slider/audio-fill"],
  ["audio-frame", "slider/audio-frame"],
  ["audio-handle", "slider/audio-handle"],
  ["xp-back", "slider/xp-back"],
  ["xp-fill", "slider/xp-fill"],
  ["xp-frame", "slider/xp-frame"],
  ["slot-frame", "wardrobe/slot-frame"],
  ["slot-frame-on", "wardrobe/slot-frame-on"],
  ["title-ribbon", "wardrobe/title-ribbon"],
  ["name-plate", "wardrobe/name-plate"],
  ["lb-row", "lb-row"],
  ["lb-row-you", "lb-row-you"],
  ["lb-rank", "lb-rank"],
  ["lb-score", "lb-score"],
] as const) {
  document.documentElement.style.setProperty(`--ui-${name}`, `url("${base}ui/${file}.webp")`);
}

// Browsers only allow audio after a user gesture.
const unlockAudio = () => audio.unlock();
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);
// Start the menu music as soon as the loading screen ends (where the device allows sound
// without a tap: the Android app, or browsers that already trust the site).
window.addEventListener("boot:done", unlockAudio, { once: true });

// Match art (public/hud/)
for (const name of ["dash", "joy-base", "joy-knob"]) {
  document.documentElement.style.setProperty(`--ui-${name}`, `url("${base}hud/${name}.webp")`);
}

startScrollFade();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
