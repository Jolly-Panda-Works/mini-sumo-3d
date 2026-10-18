import { PLAYER_COLORS } from "@mini-sumo/shared";

/** Colour swatch + slot number, so identity never relies on colour alone. */
export function PlayerBadge({ colorIndex, dim = false }: { colorIndex: number; dim?: boolean }) {
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]!;
  return (
    // The P1–P4 shield art (red, blue, green, yellow); the number is in the art, the label says it.
    <img
      className={`badge badge--art${dim ? " badge--dim" : ""}`}
      src={`${import.meta.env.BASE_URL}ui/badge-p${(colorIndex % PLAYER_COLORS.length) + 1}.webp`}
      alt={`Player ${colorIndex + 1}, ${color.label}`}
      width={120}
      height={120}
      draggable={false}
    />
  );
}
