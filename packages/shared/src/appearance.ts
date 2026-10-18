/**
 * Character customisation. Values are indexes into the option lists below, so they are
 * cheap to sync and easy to validate. The belt colour always stays the player's slot colour
 * (P1..P4), so customisation never hides who is who.
 */
export const HAIR_STYLES = [
  { id: "topknot", label: "Topknot" },
  { id: "bald", label: "Bald" },
  { id: "spiky", label: "Spiky" },
  { id: "bowl", label: "Bowl cut" },
  { id: "mohawk", label: "Mohawk" },
  { id: "ponytail", label: "Ponytail" },
  { id: "afro", label: "Afro" },
  { id: "buns", label: "Twin buns" },
  { id: "samurai", label: "Samurai band" },
  // Hats
  { id: "kasa", label: "Straw hat" },
  { id: "kabuto", label: "Samurai helmet" },
  { id: "crown", label: "Crown" },
] as const;

export const HAIR_COLORS = [
  { hex: "#2B2340", label: "Black" },
  { hex: "#7A4A2A", label: "Brown" },
  { hex: "#E07A2E", label: "Ginger" },
  { hex: "#C9CED8", label: "Silver" },
  { hex: "#3B6FD6", label: "Blue" },
  { hex: "#FF8FB8", label: "Pink" },
  { hex: "#4CB86B", label: "Green" },
  { hex: "#8E6CEF", label: "Purple" },
  { hex: "#E8B730", label: "Gold" },
  { hex: "#F3F1EA", label: "White" },
] as const;

export const FACES = [
  { id: "determined", label: "Determined" },
  { id: "happy", label: "Happy" },
  { id: "cool", label: "Cool" },
  { id: "sleepy", label: "Sleepy" },
  { id: "fierce", label: "Fierce" },
  { id: "wink", label: "Wink" },
  { id: "surprised", label: "Surprised" },
  { id: "grumpy", label: "Grumpy" },
  { id: "sparkly", label: "Sparkly eyes" },
  // Masks
  { id: "kitsune", label: "Kitsune mask" },
  { id: "oni", label: "Oni mask" },
  { id: "tengu", label: "Tengu mask" },
] as const;

export const OUTFITS = [
  { id: "classic", label: "Classic" },
  { id: "striped", label: "Striped" },
  { id: "apron", label: "Apron" },
  { id: "champion", label: "Champion" },
  { id: "polka", label: "Polka dots" },
  { id: "sagari", label: "Sagari fringe" },
  { id: "cape", label: "Hero cape" },
  { id: "armbands", label: "Armbands" },
] as const;

/** Profile pictures (public/avatars/<index>.webp). The first four are free. */
export const AVATARS = Array.from({ length: 40 }, (_, i) => ({ id: String(i), label: `Avatar ${i + 1}` }));

export interface Appearance {
  hair: number;
  hairColor: number;
  face: number;
  outfit: number;
  /** Profile picture, shown in the profile, on the home screen and in matches. */
  avatar: number;
}

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({ hair: 0, hairColor: 0, face: 0, outfit: 0, avatar: 0 });

export const APPEARANCE_LIMITS: Readonly<Record<keyof Appearance, number>> = Object.freeze({
  hair: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  face: FACES.length,
  outfit: OUTFITS.length,
  avatar: AVATARS.length,
});

function pick(raw: unknown, limit: number, fallback: number): number {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < limit ? raw : fallback;
}

/** Returns a valid appearance; unknown or out-of-range fields fall back to the default. */
export function sanitizeAppearance(raw: unknown): Appearance {
  const r = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    hair: pick(r.hair, APPEARANCE_LIMITS.hair, DEFAULT_APPEARANCE.hair),
    hairColor: pick(r.hairColor, APPEARANCE_LIMITS.hairColor, DEFAULT_APPEARANCE.hairColor),
    face: pick(r.face, APPEARANCE_LIMITS.face, DEFAULT_APPEARANCE.face),
    outfit: pick(r.outfit, APPEARANCE_LIMITS.outfit, DEFAULT_APPEARANCE.outfit),
    avatar: pick(r.avatar, APPEARANCE_LIMITS.avatar, DEFAULT_APPEARANCE.avatar),
  };
}

/** Random appearance from a [0, 1) random source. */
export function randomAppearance(random: () => number = Math.random): Appearance {
  const r = (n: number) => Math.floor(random() * n) % n;
  return {
    hair: r(APPEARANCE_LIMITS.hair),
    hairColor: r(APPEARANCE_LIMITS.hairColor),
    face: r(APPEARANCE_LIMITS.face),
    outfit: r(APPEARANCE_LIMITS.outfit),
    avatar: r(APPEARANCE_LIMITS.avatar),
  };
}
