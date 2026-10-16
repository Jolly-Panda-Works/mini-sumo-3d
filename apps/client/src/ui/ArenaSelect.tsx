import { useRef, useState } from "react";
import type { ArenaInfo } from "@mini-sumo/shared";
import { arenaImage, themeFor } from "../game/arenaThemes";
import { economyStore } from "../network/economyClient";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { Coins } from "./Coins";
import { BotLevelPicker } from "./BotLevelPicker";
import { Dialog } from "./Dialog";
import { pushToast } from "../uiStore";

/**
 * Display-only preview of the paid arenas for when the server's catalog isn't available.
 * The server (economy/config.ts) is the authority for real fees and prizes.
 */
function preview(id: string, name: string, entryFee: number, maxPrize: number, level: number): ArenaInfo {
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
    requires: { level },
    enabled: true,
  };
}

const PREVIEW: ArenaInfo[] = [
  preview("training", "Training Arena", 0, 0, 1),
  preview("rookie", "Rookie Arena", 100, 360, 1),
  preview("pro", "Pro Arena", 500, 1800, 5),
  preview("champion", "Champion Arena", 2000, 7200, 10),
];

/** Paid arenas side by side: art, mood, entry fee, prize and an Enter button. */
export function ArenaRow() {
  const economy = useStore(economyStore);
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const [confirm, setConfirm] = useState<ArenaInfo | null>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const live = economy.status === "ready" && economy.profile !== null;
  const balance = economy.profile?.balances.coins ?? 0;
  const playerLevel = economy.profile?.level.level ?? 1;
  const arenas = (live ? economy.catalog?.arenas : null)?.filter((a) => a.enabled) ?? PREVIEW;
  const busy = session.status === "connecting";

  const enter = async (arena: ArenaInfo) => {
    setConfirm(null);
    await roomManager.enterArena(arena.id, settings.name);
  };

  return (
    <>
      <div className="arena-row-wrap">

      <ul className="arena-row" aria-label="Arenas" ref={rowRef}>
        {arenas.map((arena) => {
          const theme = themeFor(arena.id);
          const free = arena.entryFee === 0;
          const locked = live && playerLevel < arena.requires.level;
          const affordable = free || (live && balance >= arena.entryFee);
          const available = free || (live && !locked && affordable);
          const soon = !free && !live;
          let status = "";
          if (soon) status = "Coming soon";
          else if (locked) status = `Unlocks at level ${arena.requires.level}`;
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
              {locked && <span className="arena-tile__badge">Level {arena.requires.level}</span>}
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
                {free && <BotLevelPicker />}
                <button
                  className="btn btn--primary arena-tile__btn"
                  disabled={busy}
                  aria-disabled={!available}
                  onClick={() => {
                    if (!available) {
                      pushToast(status || "Not available yet", "info");
                      return;
                    }
                    if (free) void roomManager.quickPlay(settings.name);
                    else setConfirm(arena);
                  }}
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

      </div>

      {confirm && (
        <Dialog
          title={confirm.name}
          onClose={() => setConfirm(null)}
          className="confirm"
          footer={
            <button className="btn btn--primary btn--big" disabled={busy} onClick={() => void enter(confirm)}>
              Enter
            </button>
          }
        >
          <img className="confirm__art" src={arenaImage(confirm.id)} alt="" width={960} height={536} />
          <div className="confirm__terms">
            <p>
              <span className="field__label">Entry</span>
              <Coins amount={confirm.entryFee} />
            </p>
            <p className="confirm__prize">
              <span className="field__label">Prize up to</span>
              <Coins amount={confirm.maxPrize} />
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
