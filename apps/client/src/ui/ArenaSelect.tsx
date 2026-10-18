import { useEffect, useRef, useState } from "react";
import type { ArenaInfo } from "@mini-sumo/shared";
import { arenaImage, themeFor } from "../game/arenaThemes";
import { economyStore } from "../network/economyClient";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { Coins } from "./Coins";
import { BotLevelPicker } from "./BotLevelPicker";
import { Dialog } from "./Dialog";
import { FreeLabel } from "./ArtButtons";
import { Icon } from "./Icon";
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
export function ArenaRow({ variant = "row" }: { variant?: "row" | "carousel" }) {
  const economy = useStore(economyStore);
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const [confirm, setConfirm] = useState<ArenaInfo | null>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const live = economy.status === "ready" && economy.profile !== null;
  const balance = economy.profile?.balances.coins ?? 0;
  const playerLevel = economy.profile?.level.level ?? 1;
  const arenas = (live ? economy.catalog?.arenas : null)?.filter((a) => a.enabled) ?? PREVIEW;
  // Phones: the card nearest the middle is full size, the others shrink by up to 15 %.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || variant !== "carousel") return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = row.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      for (const card of Array.from(row.children) as HTMLElement[]) {
        const r = card.getBoundingClientRect();
        const away = Math.min(1, Math.abs(r.left + r.width / 2 - middle) / Math.max(1, r.width));
        card.style.setProperty("--focus-scale", String(1 - 0.15 * away));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    row.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      row.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [arenas.length, variant]);

  // Wide screens: arrows only when some arenas are off screen.
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const row = rowRef.current;
    if (!row || variant !== "row") return;
    const check = () => setOverflows(row.scrollWidth > row.clientWidth + 4);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    return () => observer.disconnect();
  }, [arenas.length, variant]);
  const scrollRow = (dir: number) => {
    const row = rowRef.current;
    if (!row) return;
    const card = row.querySelector("li");
    row.scrollBy({ left: dir * ((card?.clientWidth ?? 240) + 16), behavior: "smooth" });
  };
  const busy = session.status === "connecting";

  const enter = async (arena: ArenaInfo) => {
    setConfirm(null);
    await roomManager.enterArena(arena.id, settings.name);
  };

  return (
    <>
      <div className="arena-row-wrap">
      {variant === "row" && overflows && (
        <button className="arena-row__arrow arena-row__arrow--left" onClick={() => scrollRow(-1)} aria-label="Previous arenas">
          <Icon name="arrow-left" size={34} />
        </button>
      )}

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
              <span className="arena-tile__label">
                {free ? (
                  <FreeLabel className="arena-tile__free" />
                ) : soon ? (
                  <span className="label-empty">Soon</span>
                ) : locked ? (
                  <span className="label-empty">Lvl {arena.requires.level}</span>
                ) : null}
              </span>
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
              </div>
              <button
                  className="art-btn arena-tile__btn arena-tile__play"
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
                  <img src={`${import.meta.env.BASE_URL}ui/btn-play.webp`} alt="" width={287} height={91} draggable={false} />
                </button>
            </li>
          );
        })}
      </ul>
      {variant === "row" && overflows && (
        <button className="arena-row__arrow arena-row__arrow--right" onClick={() => scrollRow(1)} aria-label="More arenas">
          <Icon name="arrow-right" size={34} />
        </button>
      )}

      </div>

      {confirm && (
        <Dialog
          title={confirm.name}
          onClose={() => setConfirm(null)}
          className="confirm"
          footer={
            <button className="art art--enter" disabled={busy} onClick={() => void enter(confirm)} aria-label={`Enter ${confirm.name}`}>
              <img src={`${import.meta.env.BASE_URL}ui/btn-enter.webp`} alt="" width={360} height={95} draggable={false} />
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
