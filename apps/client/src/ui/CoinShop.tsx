import { useState } from "react";
import { COIN_PACKS, DAILY_GIFT_COINS } from "@mini-sumo/shared";
import { economyStore, refreshProfile } from "../network/economyClient";
import { localEconomy } from "../network/localEconomy";
import { networkStore } from "../network/networkMode";
import { pushToast } from "../uiStore";
import { audio } from "../audio/AudioManager";
import { useStore } from "../store";
import { setShopOpen } from "../uiStore";
import { Coins } from "./Coins";
import { Dialog } from "./Dialog";

/** Coin shop. Packs show their coin amount; buying coins is coming soon. */
export function CoinShop() {
  const economy = useStore(economyStore);
  const balance = economy.profile?.balances.coins ?? 0;
  const base = import.meta.env.BASE_URL;
  const { mode } = useStore(networkStore);
  const local = mode !== "online";
  const [giftReady, setGiftReady] = useState(() => local && localEconomy.dailyGiftAvailable());

  const claim = () => {
    const amount = localEconomy.claimDailyGift();
    setGiftReady(false);
    if (amount > 0) {
      audio.sample("purchase");
      void refreshProfile();
      pushToast(`+${amount} Sumo Coins`, "info");
    }
  };

  return (
    <Dialog
      title={
        <span className="coin-shop__title">
          Coin shop <Coins amount={balance} />
        </span>
      }
      onClose={() => setShopOpen(false)}
      className="coin-shop"
    >
      <ul className="packs">
        <li className="pack pack--daily">
          <span className="pack__tag pack__tag--free">Free</span>
          <img className="pack__img" src={`${base}coins/pack2.webp`} alt="" width={256} height={256} />
          <p className="pack__name">Daily coins</p>
          <p className="pack__coins">
            <Coins amount={DAILY_GIFT_COINS} />
          </p>
          <button className="btn btn--primary pack__btn" disabled={!giftReady} onClick={claim} data-sfx="none">
            {!local ? "Coming soon" : giftReady ? "Claim" : "Come back tomorrow"}
          </button>
        </li>
        {COIN_PACKS.map((pack) => (
          <li key={pack.id} className={`pack${pack.tag ? " pack--tagged" : ""}`}>
            {pack.tag && <span className="pack__tag">{pack.tag}</span>}
            <img className="pack__img" src={`${base}${pack.image}`} alt="" width={256} height={256} loading="lazy" />
            <p className="pack__name">{pack.name}</p>
            <p className="pack__coins">
              <Coins amount={pack.coins} />
            </p>
            <button
              className="btn pack__btn"
              aria-disabled="true"
              aria-label={`${pack.name}, ${pack.coins} Sumo Coins: coming soon`}
              onClick={() => pushToast("Buying coins is coming soon", "info")}
            >
              Coming soon
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">Sumo Coins are used for arena entries and wardrobe items. They can't be cashed out.</p>
    </Dialog>
  );
}
