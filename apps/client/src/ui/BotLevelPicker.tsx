import { BOT_LEVELS, type BotLevel } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { useStore } from "../store";

const LABELS: Record<BotLevel, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** Bot difficulty (saved in settings; used by training and private rooms), shown as art cards. */
export function BotLevelPicker({ label = "Bots" }: { label?: string }) {
  const { botLevel } = useStore(settingsStore);
  return (
    <div className="level-picker" role="radiogroup" aria-label={`${label} difficulty`}>
      {BOT_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={botLevel === level}
          aria-label={LABELS[level]}
          className={`level-card${botLevel === level ? " level-card--on" : ""}`}
          onClick={() => settingsStore.update({ botLevel: level })}
        >
          <img src={`${import.meta.env.BASE_URL}icons/${level}.webp`} alt="" width={160} height={160} draggable={false} />
        </button>
      ))}
    </div>
  );
}
