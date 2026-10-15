import { BOT_LEVELS, type BotLevel } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { useStore } from "../store";

const LABELS: Record<BotLevel, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** Bot difficulty (saved in settings; used by training and private rooms). */
export function BotLevelPicker({ label = "Bots" }: { label?: string }) {
  const { botLevel } = useStore(settingsStore);
  return (
    <div className="level-picker" role="radiogroup" aria-label={`${label} difficulty`}>
      <span className="level-picker__label">{label}</span>
      {BOT_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={botLevel === level}
          className={`level-picker__opt${botLevel === level ? " level-picker__opt--on" : ""}`}
          onClick={() => settingsStore.update({ botLevel: level })}
        >
          {LABELS[level]}
        </button>
      ))}
    </div>
  );
}
