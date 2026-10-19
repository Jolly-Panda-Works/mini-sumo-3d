import { useEffect, useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH } from "@mini-sumo/shared";
import { economyStore } from "../network/economyClient";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { pushToast, setProfileOpen, setShopOpen, showError, showMessage, showWarning } from "../uiStore";
import { Dialog } from "./Dialog";
import { avatarSrc } from "./Avatar";
import { AVATARS, cosmeticItemId, cosmeticPrice } from "@mini-sumo/shared";
import { buyItem, ownedItems } from "../network/economyClient";
import { Coins, compactCoins } from "./Coins";
import { audio } from "../audio/AudioManager";
import { playGamesStore, signInToPlayGames } from "../network/playGames";
import { linkedEmail } from "../network/accountEmail";
import { networkStore } from "../network/networkMode";
import { EmailSavePopup } from "./EmailSavePopup";

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
    <Dialog title="Edit name" onClose={onClose} className="edit-name" variant="editname">
      <form className="edit-name__form" onSubmit={save}>
        <input
          className="input input--art"
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
  // Saving with an email: when the server can send the codes (online)
  const emailOn = useStore(networkStore).mode === "online" && Boolean(useStore(economyStore).catalog?.emailRecovery);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<"link" | "restore" | null>(null);
  useEffect(() => {
    if (!emailOn) return;
    void linkedEmail()
      .then((r) => setSavedEmail(r.email))
      .catch(() => undefined);
  }, [emailOn]);
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
            <img className="profile__avatar-edit" src={`${import.meta.env.BASE_URL}ui/btn-edit.webp`} alt="" width={140} height={146} aria-hidden="true" />
          </button>
          <div className="profile__xp">
            <div className="profile__name-row">
              <p className="profile__name">{settings.name}</p>
              <button className="profile__edit profile__edit--art" onClick={() => setEditing(true)} aria-label="Edit name">
                <img src={`${import.meta.env.BASE_URL}ui/btn-edit.webp`} alt="" width={140} height={146} draggable={false} />
              </button>
            </div>
            <div
              className="xp-bar xp-bar--art"
              style={{ ["--p" as string]: String(progress) }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label="Progress to the next level"
            >
              {/* The art bar: back, the fill cut to your progress, the frame with its star */}
              <span className="xp-bar__back" aria-hidden="true" />
              <span className="xp-bar__fill" aria-hidden="true" />
              <span className="xp-bar__frame" aria-hidden="true" />
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

        {/* Save the account with an email (every build), and bring one back on a new device */}
        {emailOn && (
          <section className="profile__save" aria-label="Save your progress">
            <h3 className="settings__heading">Save your progress</h3>
            {savedEmail ? (
              <p className="profile__saved">✓ Saved with {savedEmail}</p>
            ) : (
              <>
                <p className="hint">Save with your email to get your wrestler, coins and items back if you change or reset your phone.</p>
                <button className="plank-btn plank-btn--primary profile__save-btn" onClick={() => setEmailMode("link")}>
                  Save with email
                </button>
              </>
            )}
            <button className="profile__restore" onClick={() => setEmailMode("restore")}>
              Playing on a new device? Restore your progress
            </button>
          </section>
        )}
      </Dialog>
      {emailMode && (
        <EmailSavePopup mode={emailMode} onClose={() => setEmailMode(null)} onLinked={(email) => setSavedEmail(email)} />
      )}
      {editing && <EditName onClose={() => setEditing(false)} />}
      {picking && (
        <Dialog title="Pictures" onClose={() => setPicking(false)} className="avatar-picker" variant="sub">
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
  const current = settings.appearance.avatar;

  const choose = (index: number) => {
    if (owned.has(cosmeticItemId("avatar", index))) {
      settingsStore.update({ appearance: { ...settings.appearance, avatar: index } });
      onPicked();
    } else {
      void confirmBuy(index);
    }
  };

  /** Same confirmation as in Customise: your coins under the question, the picture, BUY. */
  const confirmBuy = async (index: number) => {
    const price = cosmeticPrice(cosmeticItemId("avatar", index));
    const balanceNow = balance;
    const choice = await showMessage(
      "Buy this item?",
      `A new picture for ${price.toLocaleString("en-US")} Sumo Coins. You have ${balanceNow.toLocaleString("en-US")}.`,
      [{ id: "buy", label: "Buy", primary: true, price }],
      {
        closable: true,
        titleExtra: (
          <span className="coin-frame coin-frame--static buy-confirm__coins" aria-label={`Your coins: ${balanceNow}`}>
            <span className="coin-frame__amount">{compactCoins(balanceNow)}</span>
          </span>
        ),
        body: (
          <div className="buy-confirm">
            <div className="buy-confirm__item">
              <img className="buy-confirm__avatar" src={avatarSrc(index)} alt="" width={160} height={160} />
            </div>
          </div>
        ),
      },
    );
    if (choice !== "buy") return;
    if (balanceNow < price) {
      const next = await showWarning("Not enough coins", "You need more Sumo Coins for this. Get some in the coin shop.", [
        { id: "shop", label: "Coin shop", primary: true },
        { id: "cancel", label: "Not now" },
      ]);
      if (next === "shop") setShopOpen(true);
      return;
    }
    await buy(index);
  };

  const buy = async (index: number) => {
    try {
      await buyItem(cosmeticItemId("avatar", index));
      audio.sample("purchase");
      settingsStore.update({ appearance: { ...settingsStore.get().appearance, avatar: index } });
      onPicked();
    } catch (e) {
      void showError("Couldn't buy", e instanceof Error ? e.message : "The purchase failed.");
    }
  };
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
    </section>
  );
}
