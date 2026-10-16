import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore, type JoystickMode, type TouchMode } from "../settings";
import { useStore } from "../store";
import { setAboutOpen, setSettingsOpen } from "../uiStore";
import { Dialog } from "./Dialog";

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

/**
 * Settings: audio and controls. On the home screen it also links to About (with the
 * version); during a match it offers "Leave match" instead.
 */
export function SettingsPanel() {
  const settings = useStore(settingsStore);
  const session = useStore(sessionStore);
  const inRoom = session.roomId !== "";
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  const close = () => setSettingsOpen(false);

  return (
    <Dialog
      title="Settings"
      onClose={close}
      className="settings"
      footer={
        inRoom ? (
          <button
            className="btn btn--danger"
            onClick={() => {
              close();
              void roomManager.leave();
            }}
          >
            Leave match
          </button>
        ) : (
          <div className="settings__about">
            <button className="btn" onClick={() => setAboutOpen(true)}>
              About
            </button>
            {version && <span className="settings__version">Version {version}</span>}
          </div>
        )
      }
    >
      {inRoom && <p className="hint">The match keeps going while this is open.</p>}
      <div className="settings__grid">
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
    </Dialog>
  );
}
