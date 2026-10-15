import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { audio } from "./audio/AudioManager";
import "./styles.css";

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
