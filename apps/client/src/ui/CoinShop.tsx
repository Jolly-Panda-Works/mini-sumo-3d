import { COIN_PACKS } from "@mini-sumo/shared";
import { economyStore } from "../network/economyClient";
import { useStore } from "../store";
import { setShopOpen } from "../uiStore";
import { Coins } from "./Coins";
import { Dialog } from "./Dialog";

/** Coin shop. Packs show their coin amount; buying coins is coming soon. */
export function CoinShop() {
  const economy = useStore(economyStore);
  const balance = economy.profile?.balances.coins ?? 0;
  const base = import.meta.env.BASE_URL;

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
    </Dialog>
  );
}
