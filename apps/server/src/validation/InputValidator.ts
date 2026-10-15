import { MAX_PLAYERS, MIN_PLAYERS, NAME_MAX_LENGTH, type InputPayload } from "@mini-sumo/shared";

const DEADZONE = 0.05;

/**
 * Validates a movement message. Returns a direction with length <= 1, or null when the
 * payload is malformed (wrong shape, non-numbers, NaN, Infinity).
 */
export function validateMoveInput(raw: unknown): InputPayload | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { x, y } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  let cx = Math.max(-1, Math.min(1, x));
  let cy = Math.max(-1, Math.min(1, y));
  const len = Math.hypot(cx, cy);
  if (len < DEADZONE) return { x: 0, y: 0 };
  if (len > 1) {
    cx /= len;
    cy /= len;
  }
  return { x: cx, y: cy };
}

// Control characters, zero-width characters and bidi overrides.
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Trims, strips control/bidi characters and limits length (by code point). */
export function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.normalize("NFC").replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
  const limited = Array.from(cleaned).slice(0, NAME_MAX_LENGTH).join("").trim();
  return limited.length > 0 ? limited : fallback;
}

export function sanitizeMaxPlayers(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return MAX_PLAYERS;
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, raw));
}

export function sanitizeIsPrivate(raw: unknown): boolean {
  return raw === true;
}
