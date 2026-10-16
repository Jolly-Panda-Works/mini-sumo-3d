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

// Loading screen: artwork, fonts, the server check and the first 3D frame.
const base = import.meta.env.BASE_URL;
const images = ["title.webp", "logo.webp", ...["training", "rookie", "pro", "champion"].map((id) => `arenas/${id}.webp`)];
images.forEach((file) => bootTrack(`img:${file}`, 1, preloadImage(`${base}${file}`)));
bootTrack("fonts", 1, document.fonts?.ready ?? Promise.resolve());
bootTrack("network", 2, roomManager.ready);
startBoot();

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
