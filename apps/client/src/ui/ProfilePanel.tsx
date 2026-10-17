import { useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { economyStore } from "../network/economyClient";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { pushToast, setProfileOpen } from "../uiStore";
import { Dialog } from "./Dialog";
import { BuyButton, NotNowButton } from "./ArtButtons";
import { avatarSrc } from "./Avatar";
import { AVATARS, cosmeticItemId, cosmeticPrice } from "@mini-sumo/shared";
import { buyItem, ownedItems } from "../network/economyClient";
import { Coins } from "./Coins";
import { audio } from "../audio/AudioManager";
import { playGamesStore, signInToPlayGames } from "../network/playGames";

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
        <button type="submit" className="art art--save" aria-label="Save" disabled={!trimmed || trimmed === settings.name}>
          <img src={`${import.meta.env.BASE_URL}ui/btn-save.webp`} alt="" width={329} height={124} draggable={false} />
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
  const [picking, setPicking] = useState(false);
  const play = useStore(playGamesStore);
  const base = import.meta.env.BASE_URL;
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
          <button className="profile__avatar" onClick={() => setPicking(true)} aria-label="Change picture">
            <img src={avatarSrc(settings.appearance.avatar)} alt="" width={160} height={160} />
            <span className="level-label" aria-label={`Level ${level.level}`}>
              <span className="level-label__value">{level.level}</span>
            </span>
            <span className="profile__avatar-edit" aria-hidden="true">
              ✎
            </span>
          </button>
          <div className="profile__xp">
            <div className="profile__name-row">
              <p className="profile__name">{settings.name}</p>
              <button className="profile__edit profile__edit--art" onClick={() => setEditing(true)} aria-label="Edit name">
                <img src={`${import.meta.env.BASE_URL}ui/btn-edit.webp`} alt="" width={140} height={146} draggable={false} />
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

        {import.meta.env.VITE_STORE !== "bazaar" && (
        <section className="profile__google" aria-label="Google Play">
          {play.status === "connected" ? (
            <button className="gplay-btn" onClick={() => pushToast("Your progress is saved to Google Play", "info")} aria-label="Connected to Google Play">
              <img src={`${base}ui/gplay-connected.webp`} alt="" width={480} height={128} draggable={false} />
            </button>
          ) : (
            <button
              className="gplay-btn"
              aria-disabled={!play.available || play.status === "working"}
              onClick={() =>
                play.available ? void signInToPlayGames() : pushToast("Google Play is available in the Android app (coming soon)", "info")
              }
              aria-label="Sign in with Google Play"
            >
              <img src={`${base}ui/gplay-sign-in.webp`} alt="" width={480} height={132} draggable={false} />
            </button>
          )}
          <p className="hint">
            {play.status === "connected"
              ? `Signed in${play.name ? ` as ${play.name}` : ""}. Your progress is saved to your Google Play account.`
              : "Sign in to keep your progress safe on your Google Play account."}
          </p>
        </section>
        )}
      </Dialog>
      {editing && <EditName onClose={() => setEditing(false)} />}
      {picking && (
        <Dialog title="Pictures" onClose={() => setPicking(false)} className="avatar-picker">
          <AvatarPicker onPicked={() => setPicking(false)} />
        </Dialog>
      )}
    </>
  );
}

/** Profile pictures: four free, the rest bought once with Sumo Coins. */
function AvatarPicker({ onPicked }: { onPicked: () => void }) {
  const settings = useStore(settingsStore);
  const economy = useStore(economyStore);
  const owned = ownedItems();
  const balance = economy.profile?.balances.coins ?? 0;
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = settings.appearance.avatar;

  const choose = (index: number) => {
    if (owned.has(cosmeticItemId("avatar", index))) {
      settingsStore.update({ appearance: { ...settings.appearance, avatar: index } });
      onPicked();
    } else {
      setError(null);
      setPending(index);
    }
  };

  const buy = async () => {
    if (pending === null) return;
    try {
      await buyItem(cosmeticItemId("avatar", pending));
      audio.sample("purchase");
      settingsStore.update({ appearance: { ...settingsStore.get().appearance, avatar: pending } });
      setPending(null);
      onPicked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The purchase failed.");
    }
  };

  const price = pending === null ? 0 : cosmeticPrice(cosmeticItemId("avatar", pending));
  return (
    <section className="avatars" aria-label="Profile picture">
      <ul className="avatars__grid">
        {AVATARS.map((avatar, i) => {
          const isOwned = owned.has(cosmeticItemId("avatar", i));
          return (
            <li key={avatar.id}>
              <button
                className={`avatars__item${i === current ? " avatars__item--on" : ""}${isOwned ? "" : " avatars__item--locked"}`}
                onClick={() => choose(i)}
                aria-pressed={i === current}
                aria-label={`${avatar.label}${isOwned ? "" : `, ${cosmeticPrice(cosmeticItemId("avatar", i))} Sumo Coins`}`}
              >
                <img src={avatarSrc(i)} alt="" width={160} height={160} loading="lazy" />
                {!isOwned && (
                  <span className="avatars__price">
                    <Coins amount={cosmeticPrice(cosmeticItemId("avatar", i))} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {pending !== null && (
        <Dialog
          title="New picture"
          onClose={() => setPending(null)}
          className="avatar-buy"
          hideClose
          footer={
            <div className="art-stack">
              <BuyButton
                price={price}
                label={`Buy this picture for ${price} Sumo Coins`}
                ariaDisabled={balance < price}
                sfx={balance < price ? undefined : "none"}
                onClick={() => (balance < price ? setError("Not enough Sumo Coins.") : void buy())}
              />
              <NotNowButton label="Not now" onClick={() => setPending(null)} />
            </div>
          }
        >
          <img className="avatar-buy__img" src={avatarSrc(pending)} alt="" width={160} height={160} />
          <p className="hint hint--center">You have {balance.toLocaleString("en-US")} coins.</p>
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}
