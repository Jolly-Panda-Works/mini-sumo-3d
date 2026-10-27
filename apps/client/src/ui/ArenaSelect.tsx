import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { arenaInfos, type ArenaInfo } from "@mini-sumo/shared";
import { arenaImage, themeFor } from "../game/arenaThemes";
import { economyStore } from "../network/economyClient";
import { roomManager, sessionStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { Coins } from "./Coins";
import { BotLevelPicker } from "./BotLevelPicker";
import { Dialog, popupLayer, useStackLevel } from "./Dialog";
import { Icon } from "./Icon";
import { pushToast, setInviteUiOpen } from "../uiStore";
import { networkStore } from "../network/networkMode";

// Same table as the economy (fees, prizes, levels): shown when the server's catalog isn't loaded.
const PREVIEW: ArenaInfo[] = arenaInfos();

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
  // Every arena this version knows, in order; the server's figures where it has them. An arena
  // the server doesn't offer yet (an older server) shows as coming soon instead of missing.
  const serverArenas = live ? economy.catalog?.arenas.filter((a) => a.enabled) : undefined;
  const onServer = new Set(serverArenas?.map((a) => a.id));
  // The row is the paid arenas, from Rookie. Training and the Private Room have their own
  // buttons (home and Friends) that open their card in a popup.
  const arenas = PREVIEW.filter((a) => a.entryFee > 0).map((local) => serverArenas?.find((a) => a.id === local.id) ?? local);
  // Phones: the card nearest the middle is full size, the others shrink by up to 15 %.
  // Card positions are measured once (and on resize); scrolling only reads scrollLeft and
  // writes transforms, so it stays smooth.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || variant !== "carousel") return;
    let frame = 0;
    let centres: number[] = [];
    let widths: number[] = [];
    const cards = () => Array.from(row.children) as HTMLElement[];
    const measure = () => {
      const list = cards();
      centres = list.map((c) => c.offsetLeft + c.offsetWidth / 2);
      widths = list.map((c) => Math.max(1, c.offsetWidth));
    };
    const update = () => {
      frame = 0;
      const middle = row.scrollLeft + row.clientWidth / 2;
      cards().forEach((card, i) => {
        const away = Math.min(1, Math.abs((centres[i] ?? 0) - middle) / (widths[i] ?? 1));
        card.style.transform = `scale(${(1 - 0.15 * away).toFixed(3)})`;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = () => {
      measure();
      schedule();
    };
    measure();
    update();
    row.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      row.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [arenas.length, variant]);

  // Mouse: drag the row to scroll it (touch and the wheel already scroll). A drag of more than
  // a few pixels doesn't count as a click, so letting go over PLAY doesn't start a bout.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let moved = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = row.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        // Snapping would fight the drag: off while dragging, back on at the end.
        row.classList.add("arena-row--dragging");
        row.setPointerCapture(e.pointerId);
      }
      if (moved) row.scrollLeft = startScroll - dx;
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (row.hasPointerCapture(e.pointerId)) row.releasePointerCapture(e.pointerId);
      if (moved) {
        row.classList.remove("arena-row--dragging");
        // Settle on the nearest card.
        const cards = Array.from(row.children) as HTMLElement[];
        const middle = row.scrollLeft + row.clientWidth / 2;
        let best = cards[0];
        for (const c of cards) {
          if (best && Math.abs(c.offsetLeft + c.offsetWidth / 2 - middle) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - middle)) best = c;
        }
        if (best) row.scrollTo({ left: best.offsetLeft + best.offsetWidth / 2 - row.clientWidth / 2, behavior: "smooth" });
      }
    };
    const click = (e: MouseEvent) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    };
    const noDrag = (e: DragEvent) => e.preventDefault();
    row.addEventListener("pointerdown", down);
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerup", up);
    row.addEventListener("pointercancel", up);
    row.addEventListener("click", click, true);
    row.addEventListener("dragstart", noDrag);
    return () => {
      row.removeEventListener("pointerdown", down);
      row.removeEventListener("pointermove", move);
      row.removeEventListener("pointerup", up);
      row.removeEventListener("pointercancel", up);
      row.removeEventListener("click", click, true);
      row.removeEventListener("dragstart", noDrag);
    };
  }, []);

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
          const available = free || (live && onServer.has(arena.id) && !locked && affordable);
          const soon = !free && (!live || !onServer.has(arena.id));
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
                {/* Soon / locked: the tag in place of the status line (not on the picture) */}
                {soon || locked ? (
                  <span className="arena-tile__tag" title={status}>
                    <span className="label-empty">{soon ? "Soon" : `Lvl ${arena.requires.level}`}</span>
                  </span>
                ) : (
                  status && <p className="arena-tile__status">{status}</p>
                )}
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
              <img src={`${import.meta.env.BASE_URL}ui/btn-enter.webp`} alt="" width={360} height={110} draggable={false} />
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

/** The first card: a private room for you and your friends (bots can join too). */
/** The free Training Arena card: bots and players, a bot level picker, PLAY. */
function TrainingCard({ busy, onPlay }: { busy: boolean; onPlay?: () => void }) {
  const theme = themeFor("training");
  return (
    <li
      className="arena-tile arena-tile--training"
      style={{ ["--accent" as string]: theme.accent, ["--tile-ink" as string]: theme.ink, ["--tile-sky" as string]: theme.sky }}
    >
      <img className="arena-tile__art" src={arenaImage("training")} alt="" width={960} height={536} decoding="async" />
      <div className="arena-tile__body">
        <h3 className="arena-tile__name">Training Arena</h3>
        <p className="arena-tile__mood">{theme.title}</p>
        <dl className="arena-tile__facts">
          <div>
            <dt>Entry</dt>
            <dd>Free</dd>
          </div>
          <div>
            <dt>Opponents</dt>
            <dd>Bots & players</dd>
          </div>
        </dl>
        <BotLevelPicker />
      </div>
      <button
        className="art-btn arena-tile__btn arena-tile__play"
        disabled={busy}
        onClick={() => {
          onPlay?.();
          void roomManager.quickPlay(settingsStore.get().name);
        }}
        aria-label="Play the Training Arena for free"
      >
        <img src={`${import.meta.env.BASE_URL}ui/btn-play.webp`} alt="" width={287} height={91} draggable={false} />
      </button>
    </li>
  );
}

function PrivateRoomCard({ busy, onPlay }: { busy: boolean; onPlay?: () => void }) {
  const theme = themeFor("private");
  const start = async () => {
    onPlay?.();
    if (await roomManager.createPrivate(settingsStore.get().name, 4)) {
      // Online: straight to inviting friends.
      if (networkStore.get().mode === "online") setInviteUiOpen(true);
    }
  };
  return (
    <li
      className="arena-tile arena-tile--private"
      style={{ ["--accent" as string]: theme.accent, ["--tile-ink" as string]: theme.ink, ["--tile-sky" as string]: theme.sky }}
    >
      <img className="arena-tile__art" src={arenaImage("private")} alt="" width={960} height={536} decoding="async" />
      <div className="arena-tile__body">
        <h3 className="arena-tile__name">Private Room</h3>
        <p className="arena-tile__mood">{theme.title}</p>
        <dl className="arena-tile__facts">
          <div>
            <dt>Entry</dt>
            <dd>Free</dd>
          </div>
          <div>
            <dt>Opponents</dt>
            <dd>Friends & bots</dd>
          </div>
        </dl>
        <p className="arena-tile__status arena-tile__status--hint">Invite friends, add bots, start when you're ready.</p>
      </div>
      <button className="art-btn arena-tile__btn arena-tile__play" disabled={busy} onClick={() => void start()} aria-label="Start a private room">
        <img src={`${import.meta.env.BASE_URL}ui/btn-play.webp`} alt="" width={287} height={91} draggable={false} />
      </button>
    </li>
  );
}

/**
 * Training or the Private Room, opened from its own button: the same card as the arenas,
 * with its picture, over a dimmed screen. PLAY starts it (and closes the popup).
 */
export function ModeCardPopup({ mode, onClose }: { mode: "training" | "private"; onClose: () => void }) {
  const session = useStore(sessionStore);
  const busy = session.status === "connecting";
  const z = useStackLevel();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="mode-card" style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label={mode === "training" ? "Training Arena" : "Private Room"}>
      <button className="mode-card__backdrop" aria-label="Close" onClick={onClose} />
      <div className="mode-card__box">
        <button className="mode-card__close" onClick={onClose} aria-label="Close">
          <img src={`${import.meta.env.BASE_URL}ui/close.webp`} alt="" draggable={false} />
        </button>
        <h2 className="mode-card__title">{mode === "training" ? "Training Arena" : "Private Room"}</h2>
        <ul className="mode-card__list">
          {mode === "training" ? <TrainingCard busy={busy} onPlay={onClose} /> : <PrivateRoomCard busy={busy} onPlay={onClose} />}
        </ul>
      </div>
    </div>,
    popupLayer(),
  );
}
