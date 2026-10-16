import { useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { economyStore } from "../network/economyClient";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { pushToast, setProfileOpen } from "../uiStore";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";

function EditName({ onClose }: { onClose: () => void }) {
  const settings = useStore(settingsStore);
  const [name, setName] = useState(settings.name);
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    settingsStore.update({ name: trimmed });
    onClose();
  };

  return (
    <Dialog title="Your name" onClose={onClose} className="edit-name">
      <form className="edit-name__form" onSubmit={save}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LENGTH))}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="nickname"
          aria-label="Name"
          autoFocus
        />
        <button type="submit" className="btn btn--primary" disabled={!trimmed || trimmed === settings.name}>
          Save
        </button>
      </form>
    </Dialog>
  );
}

/** Level and XP, name (edit with the pencil) and play stats. */
export function ProfilePanel() {
  const settings = useStore(settingsStore);
  const economy = useStore(economyStore);
  const [editing, setEditing] = useState(false);
  const profile = economy.profile;
  const level = profile?.level ?? { level: 1, xp: 0, levelStartXp: 0, nextLevelXp: 100 };
  const progress = Math.min(1, (level.xp - level.levelStartXp) / Math.max(1, level.nextLevelXp - level.levelStartXp));
  const stats = profile?.stats ?? { matches: 0, wins: 0, coinsEarned: 0 };
  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;

  const rows: [string, string | number][] = [
    ["Bouts", stats.matches],
    ["Wins", `${stats.wins} (${winRate}%)`],
    ["Wrestlers pushed out", stats.ringOuts ?? 0],
    ["Best win streak", stats.bestStreak ?? 0],
    ["Items bought", stats.itemsBought ?? 0],
  ];

  return (
    <>
      <Dialog title="Profile" onClose={() => setProfileOpen(false)} className="profile">
        <div className="profile__level">
          <span className="level-badge level-badge--big" aria-label={`Level ${level.level}`}>
            {level.level}
          </span>
          <div className="profile__xp">
            <div className="profile__name-row">
              <p className="profile__name">{settings.name}</p>
              <button className="profile__edit" onClick={() => setEditing(true)} aria-label="Edit name">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div
              className="xp-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label="Progress to the next level"
            >
              <span className="xp-bar__fill" style={{ transform: `scaleX(${progress})` }} />
            </div>
            <p className="hint">
              {level.xp - level.levelStartXp} / {level.nextLevelXp - level.levelStartXp} XP to level {level.level + 1}
            </p>
          </div>
        </div>

        <dl className="profile__stats">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="field__label">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <button
          className="btn profile__google"
          aria-disabled="true"
          onClick={() => pushToast("Google Play saving is coming soon", "info")}
        >
          <Icon name="gplay-login" size={28} />
          Save progress with Google Play <span className="tag tag--soon">Coming soon</span>
        </button>
      </Dialog>
      {editing && <EditName onClose={() => setEditing(false)} />}
    </>
  );
}
