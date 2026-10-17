import { CREDITS } from "@mini-sumo/shared";
import { GAME_TITLE } from "../config";
import { setAboutOpen } from "../uiStore";
import { Dialog } from "./Dialog";

export function AboutPanel() {
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  return (
    <Dialog title="About" onClose={() => setAboutOpen(false)} className="about-panel">
      <img className="about-panel__logo" src={`${import.meta.env.BASE_URL}logo.webp`} alt="" width={120} height={120} />
      <p className="about-panel__name">{GAME_TITLE}</p>
      {version && <p className="hint">Version {version}</p>}
      <p>
        A game by <strong>{CREDITS.author}</strong>
      </p>
      <p className="about__links">
        <a href={CREDITS.website} target="_blank" rel="noopener noreferrer">
          www.useffarahmand.com
        </a>
      </p>
      <p className="hint">© 2026 {CREDITS.author} · MIT License</p>
    </Dialog>
  );
}
