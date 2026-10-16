/** Game icons (apps/client/public/icons/*.webp). Decorative unless a label is given. */
export type IconName =
  | "medal-gold"
  | "medal-silver"
  | "medal-bronze"
  | "settings"
  | "bot"
  | "customize"
  | "coin"
  | "plus"
  | "music"
  | "sfx"
  | "easy"
  | "normal"
  | "hard"
  | "close"
  | "gplay-login"
  | "gplay-in"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up";

export function Icon({ name, size = 24, label, className = "" }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <img
      className={`icon ${className}`}
      src={`${import.meta.env.BASE_URL}icons/${name}.webp`}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
    />
  );
}
