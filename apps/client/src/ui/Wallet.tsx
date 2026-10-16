import { useEffect } from "react";
import type { LedgerCategory } from "@mini-sumo/shared";
import { economyStore, loadLedger, refreshProfile } from "../network/economyClient";
import { useStore } from "../store";
import { setWalletOpen } from "../uiStore";
import { Coins } from "./Coins";
import { Dialog } from "./Dialog";

const LABELS: Record<LedgerCategory, string> = {
  welcome: "Welcome gift",
  arena_entry: "Arena entry",
  arena_refund: "Refund",
  arena_prize: "Arena prize",
  match_reward: "Bout reward",
  daily_bonus: "Daily bonus",
  daily_gift: "Daily coins",
  cosmetic_purchase: "Shop",
  adjustment: "Adjustment",
};

/** Balance, totals and transaction history (from the server ledger). */
export function Wallet() {
  const economy = useStore(economyStore);
  const profile = economy.profile;

  useEffect(() => {
    void refreshProfile();
    void loadLedger();
  }, []);

  const coinEntries = economy.ledger.filter((e) => e.currency === "coins");
  const earned = coinEntries.filter((e) => e.amount > 0 && e.category !== "arena_refund").reduce((s, e) => s + e.amount, 0);
  const spent = coinEntries.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);

  return (
    <Dialog title="Coin history" onClose={() => setWalletOpen(false)} className="wallet">
        {!profile ? (
          <p className="notice notice--offline">
            Your coin history will appear here.
          </p>
        ) : (
          <>
            <p className="wallet__balance">
              <Coins amount={profile.balances.coins} />
            </p>
            <div className="wallet__stats">
              <p>
                <span className="field__label">Earned (recent)</span>
                <Coins amount={earned} />
              </p>
              <p>
                <span className="field__label">Spent (recent)</span>
                <Coins amount={spent} />
              </p>
              <p>
                <span className="field__label">Today's free rewards</span>
                {profile.daily.earned} / {profile.daily.cap}
              </p>
              <p>
                <span className="field__label">Bouts / wins</span>
                {profile.stats.matches} / {profile.stats.wins}
              </p>
            </div>
            <p className="hint">
              Earn coins in the free Training Arena (daily bonus for your first bout) and by winning paid arenas. Coins are
              virtual: they can't be bought, transferred or cashed out. Your coins belong to this device's guest account.
            </p>
            <h3 className="lobby__count">History</h3>
            {coinEntries.length === 0 ? (
              <p className="hint">No transactions yet.</p>
            ) : (
              <ol className="ledger">
                {coinEntries.map((entry) => (
                  <li key={entry.id} className="ledger__row">
                    <span className="ledger__what">
                      <strong>{LABELS[entry.category] ?? entry.category}</strong>
                      <span className="hint">{entry.reason}</span>
                    </span>
                    <span className={`ledger__amount${entry.amount < 0 ? " ledger__amount--minus" : ""}`}>
                      <Coins amount={entry.amount} signed />
                    </span>
                    <time className="ledger__date" dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
    </Dialog>
  );
}
