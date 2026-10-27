import { useEffect, useState } from "react";
import { COIN_PACKS, DAILY_GIFT_COINS, type CoinPack } from "@mini-sumo/shared";
import { bazaarBuyable, bazaarPrices, buyCoinPack, restoreBazaarPurchases } from "../network/bazaar";
import { economyStore, refreshProfile, request } from "../network/economyClient";
import { localEconomy } from "../network/localEconomy";
import { networkStore } from "../network/networkMode";
import { showError, pushToast } from "../uiStore";
import { audio } from "../audio/AudioManager";
import { useStore } from "../store";
import { setShopOpen } from "../uiStore";
import { Coins } from "./Coins";
import { devSamples } from "./devSamples";
import { Dialog } from "./Dialog";
import { ComingSoonButton, PriceButton } from "./ArtButtons";

/** Coin shop: daily free coins and coin packs (bought through Cafe Bazaar in the Bazaar build). */
export function CoinShop() {
  const economy = useStore(economyStore);
  const balance = economy.profile?.balances.coins ?? 0;
  const base = import.meta.env.BASE_URL;
  const { mode } = useStore(networkStore);
  const local = mode !== "online";
  // The free daily coins: from the server online, from the device offline.
  const [claimedNow, setClaimedNow] = useState(false);
  const giftReady = !claimedNow && (local ? localEconomy.dailyGiftAvailable() : Boolean(economy.profile?.daily.giftAvailable));
  // Cafe Bazaar build: packs are bought with real money through Bazaar.
  // Cafe Bazaar build: offline the coins go to this device; online the server verifies the
  // purchase and credits your account (COMING SOON until the server has its Bazaar keys).
  const storeLive = bazaarBuyable() && (local || Boolean(economy.catalog?.stores?.bazaar));
  // Dev mode: the store's BUY buttons with sample prices (buying does nothing).
  const samplePrices = useStore(devSamples).storePrices;
  const store = storeLive || samplePrices !== null;
  const [buying, setBuying] = useState<string | null>(null);
  // The packs' prices as Cafe Bazaar shows them (shown on BUY instead of a coin amount).
  const [livePrices, setPrices] = useState<Record<string, string>>({});
  const prices = samplePrices ?? livePrices;
  useEffect(() => {
    if (!storeLive) return;
    void bazaarPrices().then(setPrices);
  }, [storeLive]);

  // Finish any purchase that was paid but not credited (e.g. the app closed mid-purchase).
  useEffect(() => {
    if (!storeLive) return;
    void restoreBazaarPurchases().then((coins) => {
      if (coins > 0) {
        audio.sample("purchase");
        pushToast(`+${coins.toLocaleString("en-US")} Sumo Coins`, "info");
      }
    });
  }, [storeLive]);

  const buy = async (pack: CoinPack) => {
    if (samplePrices) {
      pushToast("Preview: coins are bought in the Cafe Bazaar app", "info");
      return;
    }
    setBuying(pack.id);
    try {
      const result = await buyCoinPack(pack);
      if (result === "bought") {
        audio.sample("purchase");
        pushToast(`+${pack.coins.toLocaleString("en-US")} Sumo Coins`, "info");
      }
    } catch (error) {
      const choice = await showError("Purchase failed", error instanceof Error ? error.message : "The purchase failed.", [
        { id: "retry", label: "Retry", primary: true },
        { id: "close", label: "Close" },
      ]);
      if (choice === "retry") {
        setBuying(null);
        return buy(pack);
      }
    } finally {
      setBuying(null);
    }
  };

  const claim = async () => {
    try {
      const amount = local
        ? localEconomy.claimDailyGift()
        : (await request<{ granted: number; balance: number }>("/daily-gift", { method: "POST" })).granted;
      setClaimedNow(true);
      if (amount > 0) {
        audio.sample("coins");
        pushToast(`+${amount} Sumo Coins`, "info");
      }
      void refreshProfile();
    } catch (error) {
      void showError("Couldn't claim", error instanceof Error ? error.message : "Try again.");
    }
  };

  return (
    <Dialog
      title="Coin shop"
      onClose={() => setShopOpen(false)}
      className="coin-shop"
    >
      <ul className="packs">
        <li className="pack pack--daily">
          <img className="pack__art" src={`${base}coins/daily.webp`} alt="" width={360} height={486} />
          <div className="pack__info">
            <p className="pack__name">Daily coins</p>
            <p className="pack__coins">
              <Coins amount={DAILY_GIFT_COINS} />
            </p>
            <button
              className="art pack__btn pack__btn--claim"
              disabled={!giftReady}
              onClick={() => void claim()}
              data-sfx="none"
              aria-label={giftReady ? "Claim the daily coins" : "Daily coins claimed"}
            >
              <img src={`${import.meta.env.BASE_URL}ui/${giftReady ? "btn-claim" : "btn-claimed"}.webp`} alt="" width={440} height={140} draggable={false} />
            </button>
          </div>
        </li>
        {COIN_PACKS.map((pack, i) => (
          <li key={pack.id} className={`pack${pack.tag ? " pack--tagged" : ""}${i === COIN_PACKS.length - 1 ? " pack--wide" : ""}`}>
            {pack.tag && (
              <img
                className="pack__tag pack__tag--art"
                src={`${import.meta.env.BASE_URL}ui/label-${pack.tag.toLowerCase().replace(/\s+/g, "-")}.webp`}
                alt={pack.tag}
                width={220}
                height={64}
              />
            )}
            <img className="pack__art" src={`${base}${pack.image}`} alt="" width={360} height={486} loading="lazy" />
            <p className="pack__name">{pack.name}</p>
            <p className="pack__coins">
              <Coins amount={pack.coins} />
            </p>
            {store ? (
              <PriceButton
                className="pack__buy"
                priceText={prices[pack.id] ?? ""}
                label={`Buy ${pack.name}, ${pack.coins} Sumo Coins, in Cafe Bazaar${prices[pack.id] ? ` for ${prices[pack.id]}` : ""}`}
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
