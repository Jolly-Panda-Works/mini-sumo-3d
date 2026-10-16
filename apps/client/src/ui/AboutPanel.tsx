import { CREDITS } from "@mini-sumo/shared";
import { GAME_TITLE } from "../config";
import { setAboutOpen } from "../uiStore";

export function AboutPanel() {
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAboutOpen(false)}>
      <section className="panel about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <img className="about-panel__logo" src={`${import.meta.env.BASE_URL}logo.webp`} alt="" width={120} height={120} />
        <h2 id="about-title" className="settings__title">
          {GAME_TITLE}
        </h2>
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
        <p className="hint">Music: “Japanese Bamboo Bansuri” by Solbox and “Taiko Percussion Loop” by Sonican (Pixabay).</p>
        <button className="btn btn--primary" onClick={() => setAboutOpen(false)}>
          Close
        </button>
      </section>
    </div>
  );
}
