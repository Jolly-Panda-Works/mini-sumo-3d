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
          A game by <strong>{CREDITS.author}</strong>. Open source under the MIT License.
        </p>
        <p className="hint">Music and sound effects are synthesised by the game. Sumo Coins are virtual and have no money value.</p>
        <p className="about__links">
          <a href={CREDITS.projectUrl} target="_blank" rel="noopener noreferrer">
            Game page
          </a>
          <a href={CREDITS.website} target="_blank" rel="noopener noreferrer">
            useffarahmand.com
          </a>
          <a href={CREDITS.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source code
          </a>
        </p>
        <button className="btn btn--primary" onClick={() => setAboutOpen(false)}>
          Close
        </button>
      </section>
    </div>
  );
}
