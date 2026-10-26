import { useEffect, useState } from "react";
import { CREDITS } from "@mini-sumo/shared";
import { GAME_TITLE } from "../config";
import { setAboutOpen } from "../uiStore";
import { bazaarAppAvailable, bazaarAutoUpdate, enableBazaarAutoUpdate, moreGamesAvailable, openMoreGames, rateOnBazaar } from "../network/bazaarApp";
import { Dialog } from "./Dialog";

const BASE = import.meta.env.BASE_URL;

export function AboutPanel() {
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  const bazaar = bazaarAppAvailable();
  // Bazaar's auto-update: offered while it's off (and the installed Bazaar supports it).
  const [autoUpdate, setAutoUpdate] = useState<"enabled" | "disabled" | "unsupported">("unsupported");
  useEffect(() => {
    if (bazaar) void bazaarAutoUpdate().then(setAutoUpdate);
  }, [bazaar]);

  return (
    <Dialog title="About" onClose={() => setAboutOpen(false)} className="about-panel" variant="sub">
      <img className="about-panel__logo" src={`${import.meta.env.BASE_URL}logo.webp`} alt="" width={120} height={120} />
      <p className="about-panel__name">{GAME_TITLE}</p>
      {version && <p className="hint">Version {version}</p>}
      <p>
        A game by <strong>{CREDITS.author}</strong>
      </p>
      {bazaar && (
        <div className="about-panel__bazaar">
          <img className="about-panel__review-icon" src={`${BASE}ui/icon-review.webp`} alt="" width={256} height={256} draggable={false} />
          <p className="hint">Enjoying Mini Sumo? Tell us what you think in Cafe Bazaar.</p>
          <button className="art about-panel__btn" onClick={() => void rateOnBazaar()} aria-label="Rate and review">
            <img src={`${BASE}ui/btn-rate-review.webp`} alt="" width={360} height={114} draggable={false} />
          </button>
          {moreGamesAvailable() && (
            <button className="art about-panel__btn" onClick={() => void openMoreGames()} aria-label="More games">
              <img src={`${BASE}ui/btn-more-games.webp`} alt="" width={360} height={114} draggable={false} />
            </button>
          )}
          {autoUpdate === "disabled" && (
            <button
              className="art about-panel__btn"
              aria-label="Turn on auto-update"
              onClick={() => {
                void enableBazaarAutoUpdate();
                // Bazaar asks the player; check again when they come back.
                window.setTimeout(() => void bazaarAutoUpdate().then(setAutoUpdate), 4000);
              }}
            >
              <img src={`${BASE}ui/btn-auto-update.webp`} alt="" width={360} height={114} draggable={false} />
            </button>
          )}
          {autoUpdate === "enabled" && <p className="hint">Auto-update is on: Bazaar keeps the game up to date.</p>}
        </div>
      )}
      <p className="about__links">
        <a href={CREDITS.website} target="_blank" rel="noopener noreferrer">
          www.useffarahmand.com
        </a>
      </p>
      <p className="hint">© 2026 {CREDITS.author} · MIT License</p>
    </Dialog>
  );
}
