import { useEffect, useRef } from "react";
import { CREDITS } from "@mini-sumo/shared";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore, type TouchMode } from "../settings";
import { useStore } from "../store";
import { setSettingsOpen } from "../uiStore";

export function SettingsPanel() {
  const settings = useStore(settingsStore);
  const session = useStore(sessionStore);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inRoom = session.roomId !== "";

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
      <section className="panel settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title" className="settings__title">
          Settings
        </h2>
        {inRoom && <p className="hint">The bout keeps going while this is open. Your wrestler stops moving.</p>}

        <label className="toggle">
          <input type="checkbox" checked={settings.sound} onChange={(e) => settingsStore.update({ sound: e.target.checked })} />
          <span>Sound effects</span>
        </label>

        <fieldset className="field">
          <legend className="field__label">Touch controls</legend>
          <div className="segmented">
            {(["auto", "on", "off"] as TouchMode[]).map((mode) => (
              <label key={mode} className={`segmented__opt${settings.touchControls === mode ? " segmented__opt--on" : ""}`}>
                <input
                  type="radio"
                  name="touch"
                  value={mode}
                  checked={settings.touchControls === mode}
                  onChange={() => settingsStore.update({ touchControls: mode })}
                />
                {mode === "auto" ? "Auto" : mode === "on" ? "Always" : "Never"}
              </label>
            ))}
          </div>
        </fieldset>

        <section className="about" aria-label="About Mini Sumo">
          <p className="field__label">About</p>
          <p className="about__text">
            Mini Sumo {import.meta.env.VITE_APP_VERSION ? `v${import.meta.env.VITE_APP_VERSION}` : ""} is made by{" "}
            <strong>{CREDITS.author}</strong> and is open source under the MIT License.
          </p>
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
        </section>

        <button ref={closeRef} className="btn btn--primary" onClick={() => setSettingsOpen(false)}>
          {inRoom ? "Back to the bout" : "Done"}
        </button>
        {inRoom && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              setSettingsOpen(false);
              void roomManager.leave();
            }}
          >
            Leave room
          </button>
        )}
      </section>
    </div>
  );
}
