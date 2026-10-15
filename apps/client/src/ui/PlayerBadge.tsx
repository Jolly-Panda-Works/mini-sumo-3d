import { PLAYER_COLORS } from "@mini-sumo/shared";

/** Colour swatch + slot number, so identity never relies on colour alone. */
export function PlayerBadge({ colorIndex, dim = false }: { colorIndex: number; dim?: boolean }) {
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]!;
  return (
    <span className={`badge${dim ? " badge--dim" : ""}`} style={{ background: color.hex }} aria-label={`Player ${colorIndex + 1}, ${color.label}`}>
      P{colorIndex + 1}
    </span>
  );
}
