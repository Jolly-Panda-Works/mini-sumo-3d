import { COIN_PACKS } from "@mini-sumo/shared";
import { economyStore } from "../network/economyClient";
import { useStore } from "../store";
import { setShopOpen, setWalletOpen } from "../uiStore";
import { Coins } from "./Coins";

/** Coin shop. Packs are shown with their coin amount; buying is not available yet. */
export function CoinShop() {
  const economy = useStore(economyStore);
  const balance = economy.profile?.balances.coins ?? 0;
  const base = import.meta.env.BASE_URL;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShopOpen(false)}>
      <section className="panel coin-shop" role="dialog" aria-modal="true" aria-labelledby="coin-shop-title">
        <div className="coin-shop__head">
          <h2 id="coin-shop-title" className="settings__title">
            Coin shop
          </h2>
          <p className="coin-shop__balance" aria-label={`Your balance: ${balance} Sumo Coins`}>
            <Coins amount={balance} />
          </p>
        </div>

        <ul className="packs">
          {COIN_PACKS.map((pack) => (
            <li key={pack.id} className={`pack${pack.tag ? " pack--tagged" : ""}`}>
              {pack.tag && <span className="pack__tag">{pack.tag}</span>}
              <img className="pack__img" src={`${base}${pack.image}`} alt="" width={256} height={256} loading="lazy" />
              <p className="pack__name">{pack.name}</p>
              <p className="pack__coins">
                <Coins amount={pack.coins} />
              </p>
              <button className="btn pack__btn" disabled aria-label={`${pack.name}, ${pack.coins} Sumo Coins: coming soon`}>
                Coming soon
              </button>
            </li>
          ))}
        </ul>

        <p className="hint">Sumo Coins are used for arena entries and wardrobe items. They can't be cashed out.</p>
        <div className="row">
          <button className="btn btn--grow" onClick={() => setWalletOpen(true)}>
            History
          </button>
          <button className="btn btn--primary btn--grow" onClick={() => setShopOpen(false)}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
