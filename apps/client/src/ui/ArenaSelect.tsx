import { useState } from "react";
import type { ArenaInfo } from "@mini-sumo/shared";
import { arenaImage, themeFor } from "../game/arenaThemes";
import { economyStore } from "../network/economyClient";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { Coins } from "./Coins";

/**
 * Display-only preview of the paid arenas for when the server's catalog isn't available.
 * The server (economy/config.ts) is the authority for real fees and prizes.
 */
function preview(id: string, name: string, entryFee: number, maxPrize: number, matches: number, wins: number): ArenaInfo {
  return {
    id,
    name,
    description: "",
    entryFee,
    currency: "coins",
    minPlayers: 2,
    maxPlayers: 4,
    economyFeePercent: 10,
    maxPrize,
    payoutRule: "",
    drawPolicy: "refund",
    bots: false,
    requires: { matches, wins },
    enabled: true,
  };
}

const PREVIEW: ArenaInfo[] = [
  preview("training", "Training Arena", 0, 0, 0, 0),
  preview("rookie", "Rookie Arena", 100, 360, 0, 0),
  preview("pro", "Pro Arena", 500, 1800, 10, 0),
  preview("champion", "Champion Arena", 2000, 7200, 20, 10),
];

/** Paid arenas side by side: art, mood, entry fee, prize and an Enter button. */
export function ArenaRow() {
  const economy = useStore(economyStore);
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const [confirm, setConfirm] = useState<ArenaInfo | null>(null);
  const live = economy.status === "ready" && economy.profile !== null;
  const balance = economy.profile?.balances.coins ?? 0;
  const stats = economy.profile?.stats ?? { matches: 0, wins: 0 };
  const arenas = (live ? economy.catalog?.arenas : null)?.filter((a) => a.enabled) ?? PREVIEW;
  const busy = session.status === "connecting";

  const enter = async (arena: ArenaInfo) => {
    setConfirm(null);
    await roomManager.enterArena(arena.id, settings.name);
  };

  return (
    <>
      <ul className="arena-row" aria-label="Arenas">
        {arenas.map((arena) => {
          const theme = themeFor(arena.id);
          const free = arena.entryFee === 0;
          const locked = live && (stats.matches < arena.requires.matches || stats.wins < arena.requires.wins);
          const affordable = free || (live && balance >= arena.entryFee);
          const available = free || (live && !locked && affordable);
          const soon = !free && !live;
          let status = "";
          if (soon) status = "Coming soon";
          else if (locked) status = `Unlocks after ${arena.requires.matches} bouts${arena.requires.wins ? `, ${arena.requires.wins} wins` : ""}`;
          else if (!affordable) status = `Need ${arena.entryFee - balance} more coins`;
          return (
            <li
              key={arena.id}
              className={`arena-tile${available ? "" : " arena-tile--off"}`}
              style={{ ["--accent" as string]: theme.accent, ["--tile-ink" as string]: theme.ink, ["--tile-sky" as string]: theme.sky }}
            >
              <img className="arena-tile__art" src={arenaImage(arena.id)} alt="" width={960} height={536} decoding="async" />
              {soon && <span className="arena-tile__badge">Coming soon</span>}
              {free && <span className="arena-tile__badge arena-tile__badge--free">Free</span>}
              <div className="arena-tile__body">
                <h3 className="arena-tile__name">{arena.name}</h3>
                <p className="arena-tile__mood">{theme.title}</p>
                <dl className="arena-tile__facts">
                  <div>
                    <dt>Entry</dt>
                    <dd>{free ? "Free" : <Coins amount={arena.entryFee} />}</dd>
                  </div>
                  <div>
                    <dt>{free ? "Opponents" : "Prize up to"}</dt>
                    <dd>{free ? "Bots & players" : <Coins amount={arena.maxPrize} />}</dd>
                  </div>
                </dl>
                {status && !soon && <p className="arena-tile__status">{status}</p>}
                <button
                  className="btn btn--primary arena-tile__btn"
                  disabled={!available || busy}
                  onClick={() => (free ? void roomManager.quickPlay(settings.name) : setConfirm(arena))}
                  aria-label={
                    free ? `Play ${arena.name} for free` : soon ? `${arena.name}: coming soon` : `Enter ${arena.name} for ${arena.entryFee} Sumo Coins`
                  }
                >
                  {free ? (busy ? "Finding a room…" : "Play") : soon ? "Coming soon" : "Enter"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

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
              <li>Sumo Coins are virtual: they can't be bought with money or cashed out.</li>
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
    </>
  );
}
