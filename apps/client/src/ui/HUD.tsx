import { LATE_GAME_MS, MATCH_DURATION_MS, POWER_UPS, POWER_UP_MS, Phase, isPowerUpKind, type PowerUpKind } from "@mini-sumo/shared";
import { gameStore, sessionStore } from "../network/RoomManager";
import { useStore } from "../store";
import { setSettingsOpen } from "../uiStore";
import { GearIcon } from "./MainMenu";
import { PlayerFrames } from "./PlayerFrames";

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
        <div className={`hud__timer timer-circle${lowTime ? " timer-circle--low" : ""}`} role="timer" aria-label="Time left">
          <span className="timer-circle__text">{formatTime(game.phase === Phase.Countdown ? MATCH_DURATION_MS : game.remainingMs)}</span>
        </div>
        <button className="tile-btn hud__gear" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <GearIcon />
        </button>
      </div>

      <PlayerFrames players={game.players} />

      {session.unstable && <p className="hud__warning">Connection unstable. Waiting for the server…</p>}

      {finalStretch && you?.alive && <p className="hud__boost">Final stretch: your dash recharges faster!</p>}
      {you?.alive && isPowerUpKind(you.powerUp) && <PowerUpBadge kind={you.powerUp} ms={you.powerUpMs} />}
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

/** Your active power-up in its frame: the emblem in the circle, the name and the time left. */
function PowerUpBadge({ kind, ms }: { kind: PowerUpKind; ms: number }) {
  const info = POWER_UPS[kind];
  const left = Math.max(0, Math.min(1, ms / POWER_UP_MS));
  return (
    <div className={`pu-frame${ms < 2000 ? " pu-frame--ending" : ""}`} role="status" style={{ ["--pu" as string]: info.color, ["--left" as string]: String(left) }}>
      <img className="pu-frame__emblem" src={`${import.meta.env.BASE_URL}powerups/${kind}-coin.webp`} alt="" width={210} height={210} />
      <span className="pu-frame__name">{info.name}</span>
      <span className="pu-frame__time">
        <span className="pu-frame__seconds">{Math.ceil(ms / 1000)}</span>
        <span className="pu-frame__bar" aria-hidden="true" />
      </span>
    </div>
  );
}
