import { useEffect, useState } from "react";
import { COIN_PACKS, DAILY_GIFT_COINS, type CoinPack } from "@mini-sumo/shared";
import { bazaarEnabled, buyCoinPack, restoreBazaarPurchases } from "../network/bazaar";
import { economyStore, refreshProfile } from "../network/economyClient";
import { localEconomy } from "../network/localEconomy";
import { networkStore } from "../network/networkMode";
import { pushToast } from "../uiStore";
import { audio } from "../audio/AudioManager";
import { useStore } from "../store";
import { setShopOpen } from "../uiStore";
import { Coins } from "./Coins";
import { Dialog } from "./Dialog";
import { BuyButton, ComingSoonButton, FreeLabel } from "./ArtButtons";

/** Coin shop: daily free coins and coin packs (bought through Cafe Bazaar in the Bazaar build). */
export function CoinShop() {
  const economy = useStore(economyStore);
  const balance = economy.profile?.balances.coins ?? 0;
  const base = import.meta.env.BASE_URL;
  const { mode } = useStore(networkStore);
  const local = mode !== "online";
  const [giftReady, setGiftReady] = useState(() => local && localEconomy.dailyGiftAvailable());
  // Cafe Bazaar build: packs are bought with real money through Bazaar.
  const store = local && bazaarEnabled();
  const [buying, setBuying] = useState<string | null>(null);

  // Finish any purchase that was paid but not credited (e.g. the app closed mid-purchase).
  useEffect(() => {
    if (!store) return;
    void restoreBazaarPurchases().then((coins) => {
      if (coins > 0) {
        audio.sample("purchase");
        pushToast(`+${coins.toLocaleString("en-US")} Sumo Coins`, "info");
      }
    });
  }, [store]);

  const buy = async (pack: CoinPack) => {
    setBuying(pack.id);
    try {
      const result = await buyCoinPack(pack);
      if (result === "bought") {
        audio.sample("purchase");
        pushToast(`+${pack.coins.toLocaleString("en-US")} Sumo Coins`, "info");
      }
    } catch (error) {
      audio.sample("reject");
      pushToast(error instanceof Error ? error.message : "The purchase failed.", "error");
    } finally {
      setBuying(null);
    }
  };

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
      title="Coin shop"
      sub={
        <span className="coin-frame coin-frame--static" aria-label={`Your coins: ${balance}`}>
          <span className="coin-frame__amount">{balance.toLocaleString("en-US")}</span>
        </span>
      }
      onClose={() => setShopOpen(false)}
      className="coin-shop"
    >
      <ul className="packs">
        <li className="pack pack--daily">
          <img className="pack__art" src={`${base}coins/daily.webp`} alt="" width={360} height={486} />
          <div className="pack__info">
            <FreeLabel className="pack__free" />
            <p className="pack__name">Daily coins</p>
            <p className="pack__coins">
              <Coins amount={DAILY_GIFT_COINS} />
            </p>
            <button className="btn btn--primary pack__btn" disabled={!giftReady} onClick={claim} data-sfx="none">
              {!local ? "Coming soon" : giftReady ? "Claim" : "Come back tomorrow"}
            </button>
          </div>
        </li>
        {COIN_PACKS.map((pack, i) => (
          <li key={pack.id} className={`pack${pack.tag ? " pack--tagged" : ""}${i === COIN_PACKS.length - 1 ? " pack--wide" : ""}`}>
            {pack.tag && <span className="pack__tag">{pack.tag}</span>}
            <img className="pack__art" src={`${base}${pack.image}`} alt="" width={360} height={486} loading="lazy" />
            <p className="pack__name">{pack.name}</p>
            <p className="pack__coins">
              <Coins amount={pack.coins} />
            </p>
            {store ? (
              <BuyButton
                className="pack__buy"
                price={pack.coins}
                label={`Buy ${pack.name}, ${pack.coins} Sumo Coins, in Cafe Bazaar`}
                disabled={buying !== null}
                sfx="none"
                onClick={() => void buy(pack)}
              />
            ) : (
              <ComingSoonButton
                className="pack__soon"
                ariaDisabled
                label={`${pack.name}, ${pack.coins} Sumo Coins: coming soon`}
                onClick={() => pushToast("Buying coins is coming soon", "info")}
              />
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
