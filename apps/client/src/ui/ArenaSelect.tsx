import { useState } from "react";
import type { ArenaInfo } from "@mini-sumo/shared";
import { arenaImage, themeFor } from "../game/arenaThemes";
import { economyStore } from "../network/economyClient";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setHomeArena } from "../uiStore";
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
  const arenas = (live ? economy.catalog?.arenas : null)?.filter((a) => a.enabled && a.entryFee > 0) ?? PREVIEW;
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
          const locked = live && (stats.matches < arena.requires.matches || stats.wins < arena.requires.wins);
          const affordable = live && balance >= arena.entryFee;
          const available = live && !locked && affordable;
          let status = "";
          if (!live) status = "Coming soon";
          else if (locked) status = `Unlocks after ${arena.requires.matches} bouts${arena.requires.wins ? `, ${arena.requires.wins} wins` : ""}`;
          else if (!affordable) status = `Need ${arena.entryFee - balance} more coins`;
          return (
            <li
              key={arena.id}
              className={`arena-tile${available ? "" : " arena-tile--off"}`}
              style={{ ["--accent" as string]: theme.accent, ["--tile-ink" as string]: theme.ink, ["--tile-sky" as string]: theme.sky }}
              onPointerEnter={() => setHomeArena(arena.id)}
              onFocus={() => setHomeArena(arena.id)}
            >
              <img className="arena-tile__art" src={arenaImage(arena.id)} alt="" width={960} height={536} decoding="async" />
              {!live && <span className="arena-tile__badge">Coming soon</span>}
              <div className="arena-tile__body">
                <h3 className="arena-tile__name">{arena.name}</h3>
                <p className="arena-tile__mood">{theme.title}</p>
                <dl className="arena-tile__facts">
                  <div>
                    <dt>Entry</dt>
                    <dd>
                      <Coins amount={arena.entryFee} />
                    </dd>
                  </div>
                  <div>
                    <dt>Prize up to</dt>
                    <dd>
                      <Coins amount={arena.maxPrize} />
                    </dd>
                  </div>
                </dl>
                {status && live && <p className="arena-tile__status">{status}</p>}
                <button
                  className="btn btn--primary arena-tile__btn"
                  disabled={!available || busy}
                  onClick={() => setConfirm(arena)}
                  aria-label={live ? `Enter ${arena.name} for ${arena.entryFee} Sumo Coins` : `${arena.name}: coming soon`}
                >
                  {live ? "Enter" : "Coming soon"}
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
