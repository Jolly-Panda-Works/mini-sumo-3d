import { useState } from "react";
import type { ArenaInfo } from "@mini-sumo/shared";
import { economyStore } from "../network/economyClient";
import { networkStore } from "../network/networkMode";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setArenasOpen } from "../uiStore";
import { Coins } from "./Coins";

const TRAINING_FALLBACK: ArenaInfo = {
  id: "training",
  name: "Training Arena",
  description: "Free practice against bots.",
  entryFee: 0,
  currency: "coins",
  minPlayers: 2,
  maxPlayers: 4,
  economyFeePercent: 0,
  maxPrize: 0,
  payoutRule: "Free. Practice as much as you like.",
  drawPolicy: "refund",
  bots: true,
  requires: { matches: 0, wins: 0 },
  enabled: true,
};

/** Arena tiers with entry fee, possible prize, rules and the player's balance. */
export function ArenaSelect() {
  const economy = useStore(economyStore);
  const { mode } = useStore(networkStore);
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const [confirm, setConfirm] = useState<ArenaInfo | null>(null);
  const online = mode === "online" && economy.status === "ready" && economy.profile !== null;
  const balance = economy.profile?.balances.coins ?? 0;
  const stats = economy.profile?.stats ?? { matches: 0, wins: 0 };
  const arenas = economy.catalog?.arenas.filter((a) => a.enabled) ?? [TRAINING_FALLBACK];
  const busy = session.status === "connecting";

  const enter = async (arena: ArenaInfo) => {
    setConfirm(null);
    const ok = await roomManager.enterArena(arena.id, settings.name);
    if (ok) setArenasOpen(false);
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setArenasOpen(false)}>
      <section className="panel arenas" role="dialog" aria-modal="true" aria-labelledby="arenas-title">
        <div className="arenas__head">
          <h2 id="arenas-title" className="settings__title">
            Arenas
          </h2>
          {online && (
            <p className="arenas__balance" aria-label={`Your balance: ${balance} Sumo Coins`}>
              <Coins amount={balance} />
            </p>
          )}
        </div>

        {!online && (
          <p className="notice notice--offline">
            {mode === "offline"
              ? "Paid arenas, coins and the shop need the online server, which isn't live yet. Training is free and always open."
              : economy.status === "error"
                ? `Couldn't load your wallet: ${economy.error ?? "unknown error"}. Training is still open.`
                : "Loading your wallet…"}
          </p>
        )}

        <ul className="arena-list">
          {arenas.map((arena) => {
            const paid = arena.entryFee > 0;
            const locked = paid && (stats.matches < arena.requires.matches || stats.wins < arena.requires.wins);
            const affordable = !paid || balance >= arena.entryFee;
            const available = !paid || (online && !locked && affordable);
            let status = "";
            if (paid && !online) status = "Needs the online server";
            else if (locked) status = `Unlocks after ${arena.requires.matches} bouts${arena.requires.wins ? ` and ${arena.requires.wins} wins` : ""}`;
            else if (!affordable) status = `You need ${arena.entryFee - balance} more coins`;
            return (
              <li key={arena.id} className={`arena-card${available ? "" : " arena-card--off"}`}>
                <div className="arena-card__main">
                  <h3 className="arena-card__name">{arena.name}</h3>
                  <p className="hint">{arena.description}</p>
                  <dl className="arena-card__facts">
                    <div>
                      <dt>Entry fee</dt>
                      <dd>{paid ? <Coins amount={arena.entryFee} /> : "Free"}</dd>
                    </div>
                    <div>
                      <dt>{paid ? "Winner gets up to" : "Rewards"}</dt>
                      <dd>{paid ? <Coins amount={arena.maxPrize} /> : "A few coins per bout"}</dd>
                    </div>
                    <div>
                      <dt>Players</dt>
                      <dd>
                        {arena.minPlayers}–{arena.maxPlayers}
                        {arena.bots ? ", bots fill in" : ", players only"}
                      </dd>
                    </div>
                  </dl>
                  <p className="arena-card__rule">{arena.payoutRule}</p>
                  {status && <p className="arena-card__status">{status}</p>}
                </div>
                <button
                  className={`btn ${available ? "btn--primary" : ""}`}
                  disabled={!available || busy}
                  onClick={() => (paid ? setConfirm(arena) : void enter(arena))}
                >
                  {paid ? "Enter" : "Play free"}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="hint">
          Sumo Coins are virtual. They can't be bought with money, sent to other players or cashed out.
        </p>
        {session.error && (
          <p className="notice notice--error" role="alert">
            {session.error}
          </p>
        )}
        <button className="btn btn--ghost" onClick={() => setArenasOpen(false)}>
          Close
        </button>
      </section>

      {confirm && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <section className="panel confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title" className="settings__title">
              Enter {confirm.name}?
            </h2>
            <p>
              Entry fee: <Coins amount={confirm.entryFee} /> (you have <Coins amount={balance} />).
            </p>
            <ul className="confirm__rules">
              <li>The fee is paid when you join a room.</li>
              <li>If the bout doesn't start (not enough players, you leave before it starts, or a draw), you get it back.</li>
              <li>Leaving or disconnecting during the bout counts as being pushed out: no refund.</li>
              <li>
                The winner gets the pool minus a {confirm.economyFeePercent}% economy fee: up to <Coins amount={confirm.maxPrize} /> with{" "}
                {confirm.maxPlayers} players. Winning is never guaranteed.
              </li>
            </ul>
            <div className="row">
              <button className="btn btn--grow" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn--primary btn--grow" disabled={busy} onClick={() => void enter(confirm)}>
                Pay and enter
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
