import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setAboutOpen, setSettingsOpen } from "../uiStore";
import { Dialog } from "./Dialog";
import { setDevEnabled } from "./DevPanel";
import { setDevOpen, showWarning } from "../uiStore";
import { AboutButton, VibrationToggle } from "./ArtButtons";
import { Icon, type IconName } from "./Icon";

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

function Slider({ label, icon, value, onChange }: { label: string; icon: IconName; value: number; onChange: (value: number) => void }) {
  return (
    <label className="slider">
      <span className="slider__label">
        <span className="slider__name">
          <Icon name={icon} size={26} />
          {label}
        </span>
        <span className="slider__value">{Math.round(value * 100)}%</span>
      </span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} />
    </label>
  );
}

let versionTaps = 0;
let versionTimer = 0;

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
      className={inRoom ? "settings settings-match" : "settings"}
    >
      <div className="settings__grid">
        <section className="settings__section" aria-label="Audio">
          <h3 className="settings__heading">Audio</h3>
          <Slider label="Music" icon="music" value={settings.musicVolume} onChange={(musicVolume) => settingsStore.update({ musicVolume })} />
          <Slider label="Sound effects" icon="sfx" value={settings.sfxVolume} onChange={(sfxVolume) => settingsStore.update({ sfxVolume })} />
        </section>

        <section className="settings__section" aria-label="Controls">
          <h3 className="settings__heading">Controls</h3>
          <div className="field">
            <span className="field__label">Joystick</span>
            <div className="art-choice" role="radiogroup" aria-label="Joystick">
              {(
                [
                  ["fixed", "joystick-fixed", "Fixed corner"],
                  ["floating", "joystick-thumb", "Under your thumb"],
                ] as const
              ).map(([mode, art, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={settings.joystick === mode}
                  aria-label={label}
                  className="art art--choice"
                  onClick={() => settingsStore.update({ joystick: mode })}
                >
                  <img src={`${import.meta.env.BASE_URL}ui/${art}-${settings.joystick === mode ? "on" : "off"}.webp`} alt="" draggable={false} />
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label">Vibration on dash and hits</span>
            <VibrationToggle on={settings.vibration} onChange={(vibration) => settingsStore.update({ vibration })} />
          </div>
        </section>
      </div>
      {inRoom && (
        <div className="settings__leave">
          <button
            className="art art--leave"
            aria-label="Leave match"
            onClick={() => {
              void showWarning("Leave the match?", "The bout is still going. If you leave now, you lose this bout.", [
                { id: "leave", label: "Leave", primary: true },
                { id: "cancel", label: "Stay" },
              ]).then((choice) => {
                if (choice !== "leave") return;
                close();
                void roomManager.leave();
              });
              return;
            }}
          >
            <img src={`${import.meta.env.BASE_URL}ui/btn-leave.webp`} alt="" width={503} height={139} draggable={false} />
          </button>
        </div>
      )}
      {!inRoom && (
        <div className="settings__about settings__about--row">
          <span
            className="settings__version"
            onClick={() => {
              versionTaps += 1;
              window.clearTimeout(versionTimer);
              versionTimer = window.setTimeout(() => (versionTaps = 0), 1500);
              if (versionTaps >= 7) {
                versionTaps = 0;
                setDevEnabled(true);
                close();
                setDevOpen(true);
              }
            }}
          >
            {version ? `Version ${version}` : ""}
          </span>
          <AboutButton className="settings__about-btn" label="About" onClick={() => setAboutOpen(true)} />
        </div>
      )}
    </Dialog>
  );
}
