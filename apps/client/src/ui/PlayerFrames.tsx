import { POWER_UPS, isPowerUpKind } from "@mini-sumo/shared";
import type { UIPlayer } from "../network/RoomManager";
import { avatarSrc } from "./Avatar";

const FRAMES = ["red", "blue", "green", "yellow"] as const;
const BASE = import.meta.env.BASE_URL;

/**
 * The wrestlers in the top-left corner, each in their colour frame (P1 red, P2 blue, P3 green,
 * P4 yellow): picture, name and level; another player's power-up shows as its flag.
 */
export function PlayerFrames({ players }: { players: readonly UIPlayer[] }) {
  return (
    <ul className="frames" aria-label="Wrestlers">
      {[...players]
        .sort((a, b) => a.colorIndex - b.colorIndex)
        .map((p) => (
          <li
            key={p.id}
            className={`frame${p.alive ? "" : " frame--out"}${p.isYou ? " frame--you" : ""}`}
            style={{ backgroundImage: `url("${BASE}hud/player-${FRAMES[p.colorIndex % FRAMES.length]}.webp")` }}
          >
            <img className="frame__avatar" src={avatarSrc(p.appearance.avatar)} alt="" width={160} height={160} />
            <span className="frame__name">{p.isYou ? `${p.name} (you)` : p.name}</span>
            <span className="frame__level" aria-label={`Level ${p.level}`}>
              {p.level}
            </span>
            {!p.isYou && p.alive && isPowerUpKind(p.powerUp) && (
              <img
                className="frame__powerup"
                src={`${BASE}powerups/${p.powerUp}-flag.webp`}
                alt={`Power-up: ${POWER_UPS[p.powerUp].name}`}
                title={POWER_UPS[p.powerUp].name}
                width={80}
                height={200}
              />
            )}
            {!p.alive && <span className="frame__state">{p.elimReason === "left" ? "Left" : "Out"}</span>}
          </li>
        ))}
    </ul>
  );
}
