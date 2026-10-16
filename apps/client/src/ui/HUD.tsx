import { LATE_GAME_MS, MATCH_DURATION_MS, Phase } from "@mini-sumo/shared";
import { gameStore, sessionStore } from "../network/RoomManager";
import { useStore } from "../store";
import { setSettingsOpen } from "../uiStore";
import { GearIcon } from "./MainMenu";
import { PlayerBadge } from "./PlayerBadge";

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HUD({ touch }: { touch: boolean }) {
  const game = useStore(gameStore);
  const session = useStore(sessionStore);
  const you = game.players.find((p) => p.isYou);
  const playing = game.phase === Phase.Playing;
  const lowTime = playing && game.remainingMs <= 10_000;
  const dashReady = !you || you.dashCooldownMs <= 0;
  const dashProgress = you ? 1 - Math.min(1, you.dashCooldownMs / Math.max(1, you.dashCooldownTotalMs)) : 1;
  const finalStretch = playing && game.remainingMs > 0 && game.remainingMs <= LATE_GAME_MS;

  return (
    <div className="hud">
      <div className="hud__top">
        <div className={`hud__timer${lowTime ? " hud__timer--low" : ""}`} role="timer" aria-label="Time left">
          {formatTime(game.phase === Phase.Countdown ? MATCH_DURATION_MS : game.remainingMs)}
        </div>
        <button className="icon-btn hud__gear" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <GearIcon />
        </button>
      </div>

      <ul className="hud__players" aria-label="Wrestlers">
        {game.players.map((p) => (
          <li key={p.id} className={`chip${p.alive ? "" : " chip--out"}${p.isYou ? " chip--you" : ""}`}>
            <PlayerBadge colorIndex={p.colorIndex} dim={!p.alive} />
            <span className="chip__name">{p.isYou ? "You" : p.name}</span>
            {!p.alive && <span className="chip__state">{p.elimReason === "left" ? "Left" : "Out"}</span>}
          </li>
        ))}
      </ul>

      {session.unstable && <p className="hud__warning">Connection unstable. Waiting for the server…</p>}

      {finalStretch && you?.alive && <p className="hud__boost">Final stretch: your dash recharges faster!</p>}
      {finalStretch && you?.alive && <FinalVignette remainingMs={game.remainingMs} />}

      {you && !you.alive && playing && <p className="hud__spectate">You're out. Watching the rest of the bout.</p>}

      {!touch && you?.alive !== false && (
        <div className="hud__bottom">
          <div className={`dash-meter${dashReady ? " dash-meter--ready" : ""}`} aria-label={dashReady ? "Dash ready" : "Dash recharging"}>
            <span className="dash-meter__fill" style={{ transform: `scaleX(${dashProgress})` }} />
            <span className="dash-meter__label">{dashReady ? "Dash ready" : `Dash ${(you!.dashCooldownMs / 1000).toFixed(1)}s`}</span>
          </div>
          <p className="hud__hint">WASD or arrows to move, Space to dash, Esc for settings</p>
        </div>
      )}
    </div>
  );
}

/**
 * Final 30 seconds: a glow around the screen edge, yellow at first and turning red (and
 * pulsing faster) as the clock runs out.
 */
function FinalVignette({ remainingMs }: { remainingMs: number }) {
  const late = Math.max(0, Math.min(1, 1 - remainingMs / LATE_GAME_MS));
  const r = Math.round(255 - 25 * late);
  const g = Math.round(200 - 165 * late);
  const b = Math.round(40 - 5 * late);
  return (
    <div
      className="vignette"
      aria-hidden="true"
      style={{
        ["--vignette" as string]: `rgba(${r}, ${g}, ${b}, ${0.45 + 0.35 * late})`,
        ["--vignette-speed" as string]: `${1.6 - 0.9 * late}s`,
      }}
    />
  );
}
