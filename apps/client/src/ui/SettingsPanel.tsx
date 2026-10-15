import { useEffect, useRef, useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore, type JoystickMode, type TouchMode } from "../settings";
import { useStore } from "../store";
import { setAboutOpen, setSettingsOpen } from "../uiStore";

function Segmented<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="field">
      <legend className="field__label">{label}</legend>
      <div className="segmented">
        {options.map(([optionValue, optionLabel]) => (
          <label key={optionValue} className={`segmented__opt${value === optionValue ? " segmented__opt--on" : ""}`}>
            <input type="radio" name={name} value={optionValue} checked={value === optionValue} onChange={() => onChange(optionValue)} />
            {optionLabel}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="slider">
      <span className="slider__label">
        {label}
        <span className="slider__value">{Math.round(value * 100)}%</span>
      </span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} />
    </label>
  );
}

export function SettingsPanel() {
  const settings = useStore(settingsStore);
  const session = useStore(sessionStore);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inRoom = session.roomId !== "";
  const [name, setName] = useState(settings.name);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);
    if (!trimmed) return;
    settingsStore.update({ name: trimmed });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
      <section className="panel settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title" className="settings__title">
          Settings
        </h2>
        {inRoom && <p className="hint">The bout keeps going while this is open. Your wrestler stops moving.</p>}

        <div className="settings__grid">
          <section className="settings__section" aria-label="Profile">
            <h3 className="settings__heading">Profile</h3>
            <form className="row" onSubmit={saveName}>
              <label className="field field--grow">
                <span className="field__label">Name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LENGTH))}
                  maxLength={NAME_MAX_LENGTH}
                  autoComplete="nickname"
                  disabled={inRoom}
                />
              </label>
              <button type="submit" className="btn" disabled={inRoom || !name.trim() || name.trim() === settings.name}>
                {saved ? "Saved" : "Save"}
              </button>
            </form>
            {inRoom && <p className="hint">You can change your name between bouts.</p>}
            <button className="btn" disabled aria-describedby="google-soon">
              Save progress to Google account <span className="tag tag--soon" id="google-soon">Coming soon</span>
            </button>
          </section>

          <section className="settings__section" aria-label="Audio">
            <h3 className="settings__heading">Audio</h3>
            <Slider label="Music" value={settings.musicVolume} onChange={(musicVolume) => settingsStore.update({ musicVolume })} />
            <Slider label="Sound effects" value={settings.sfxVolume} onChange={(sfxVolume) => settingsStore.update({ sfxVolume })} />
          </section>

          <section className="settings__section" aria-label="Controls">
            <h3 className="settings__heading">Controls</h3>
            <Segmented<TouchMode>
              label="Touch controls"
              name="touch"
              value={settings.touchControls}
              options={[
                ["auto", "Auto"],
                ["on", "Always"],
                ["off", "Never"],
              ]}
              onChange={(touchControls) => settingsStore.update({ touchControls })}
            />
            <Segmented<JoystickMode>
              label="Joystick"
              name="joystick"
              value={settings.joystick}
              options={[
                ["floating", "Under your thumb"],
                ["fixed", "Fixed corner"],
              ]}
              onChange={(joystick) => settingsStore.update({ joystick })}
            />
            <label className="toggle">
              <input type="checkbox" checked={settings.vibration} onChange={(e) => settingsStore.update({ vibration: e.target.checked })} />
              <span>Vibration on dash and hits</span>
            </label>
          </section>
        </div>

        <div className="row">
          <button className="btn btn--grow" onClick={() => setAboutOpen(true)}>
            About
          </button>
          <button ref={closeRef} className="btn btn--primary btn--grow" onClick={() => setSettingsOpen(false)}>
            {inRoom ? "Back to the bout" : "Done"}
          </button>
        </div>
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
