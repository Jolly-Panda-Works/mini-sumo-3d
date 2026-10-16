import { useState, type FormEvent } from "react";
import { ARENA_DEFS, NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { economyStore } from "../network/economyClient";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setProfileOpen, setWalletOpen, setWardrobeOpen } from "../uiStore";
import { Coins } from "./Coins";
import { Dialog } from "./Dialog";

/** Name, level and XP, stats, arena unlocks and links to the wardrobe and coin history. */
export function ProfilePanel() {
  const settings = useStore(settingsStore);
  const economy = useStore(economyStore);
  const profile = economy.profile;
  const [name, setName] = useState(settings.name);
  const [saved, setSaved] = useState(false);
  const level = profile?.level ?? { level: 1, xp: 0, levelStartXp: 0, nextLevelXp: 100 };
  const progress = Math.min(1, (level.xp - level.levelStartXp) / Math.max(1, level.nextLevelXp - level.levelStartXp));
  const stats = profile?.stats ?? { matches: 0, wins: 0, coinsEarned: 0 };
  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);
    if (!trimmed) return;
    settingsStore.update({ name: trimmed });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <Dialog title="Profile" onClose={() => setProfileOpen(false)} className="profile">
      <div className="profile__level">
        <span className="level-badge level-badge--big" aria-label={`Level ${level.level}`}>
          {level.level}
        </span>
        <div className="profile__xp">
          <p className="profile__name">{settings.name}</p>
          <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progress to the next level">
            <span className="xp-bar__fill" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="hint">
            {level.xp - level.levelStartXp} / {level.nextLevelXp - level.levelStartXp} XP to level {level.level + 1}
          </p>
        </div>
      </div>

      <form className="row" onSubmit={saveName}>
        <label className="field field--grow">
          <span className="field__label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LENGTH))} maxLength={NAME_MAX_LENGTH} autoComplete="nickname" />
        </label>
        <button type="submit" className="btn" disabled={!name.trim() || name.trim() === settings.name}>
          {saved ? "Saved" : "Save"}
        </button>
      </form>

      <div className="profile__stats">
        <p>
          <span className="field__label">Bouts</span>
          {stats.matches}
        </p>
        <p>
          <span className="field__label">Wins</span>
          {stats.wins} ({winRate}%)
        </p>
        <p>
          <span className="field__label">Coins earned</span>
          <Coins amount={stats.coinsEarned} />
        </p>
        <p>
          <span className="field__label">Balance</span>
          <Coins amount={profile?.balances.coins ?? 0} />
        </p>
      </div>

      <section aria-label="Arena unlocks">
        <h3 className="settings__heading">Arenas</h3>
        <ul className="unlocks">
          {ARENA_DEFS.map((arena) => {
            const open = level.level >= arena.requiredLevel;
            return (
              <li key={arena.id} className={`unlocks__row${open ? " unlocks__row--open" : ""}`}>
                <span>{arena.name}</span>
                <span>{open ? "Unlocked" : `Level ${arena.requiredLevel}`}</span>
              </li>
            );
          })}
        </ul>
        <p className="hint">Earn XP in every finished bout: more in higher arenas, extra for wins.</p>
      </section>

      <div className="row">
        <button
          className="btn btn--grow"
          onClick={() => {
            setProfileOpen(false);
            setWardrobeOpen(true);
          }}
        >
          Customise wrestler
        </button>
        <button className="btn btn--grow" onClick={() => setWalletOpen(true)}>
          Coin history
        </button>
      </div>
      <button className="btn" disabled>
        Save progress to Google account <span className="tag tag--soon">Coming soon</span>
      </button>
    </Dialog>
  );
}
