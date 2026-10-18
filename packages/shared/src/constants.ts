/** Game credits shown in the menu, settings, apps and server responses. */
export const CREDITS = {
  author: "Usef Farahmand",
  website: "https://www.useffarahmand.com",
  projectUrl: "https://www.useffarahmand.com/en/projects/mini-sumo",
  sourceUrl: "https://github.com/Jolly-Panda-Works/mini-sumo-3d",
} as const;

/** Colyseus room type name registered on the server. */
export const ROOM_NAME = "mini_sumo";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Gameplay world units are metres on the arena floor (x, y). The client maps y to three.js z. */
export const ARENA_RADIUS = 7;
/** A player is out once their centre is farther than ARENA_RADIUS + ELIMINATION_TOLERANCE from the centre. */
export const ELIMINATION_TOLERANCE = 0.2;
export const PLAYER_RADIUS = 0.75;

export const DASH_COOLDOWN_MS = 3000;
export const MATCH_DURATION_MS = 90_000;
export const COUNTDOWN_MS = 3000;
/** Bot difficulty levels (training and private rooms). */
export const BOT_LEVELS = ["easy", "normal", "hard"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export function sanitizeBotLevel(raw: unknown): BotLevel {
  return BOT_LEVELS.includes(raw as BotLevel) ? (raw as BotLevel) : "normal";
}

/**
 * Power-ups: a flag appears on the ring every few seconds; whoever grabs it gets the power
 * for POWER_UP_MS. The kanji is drawn on the flag (and on the banner behind the wrestler).
 */
export const POWER_UPS = {
  iron: { kanji: "鉄", name: "Iron Body", description: "Twice as heavy: hard to push, pushes harder.", color: "#7E8AA6" },
  thunder: { kanji: "雷", name: "Thunder Dash", description: "Dash recharges in under a second.", color: "#F2B21E" },
  wind: { kanji: "風", name: "Wind Feet", description: "Much faster on your feet.", color: "#3FB58E" },
  giant: { kanji: "巨", name: "Giant", description: "Grow big and heavy.", color: "#E2443A" },
} as const;
export type PowerUpKind = keyof typeof POWER_UPS;
export const POWER_UP_KINDS = Object.keys(POWER_UPS) as PowerUpKind[];
export const POWER_UP_MS = 12_000;

export function isPowerUpKind(value: unknown): value is PowerUpKind {
  return typeof value === "string" && value in POWER_UPS;
}

/** In the last part of a bout, players' dash recharges faster and bots ease off. */
export const LATE_GAME_MS = 30_000;

/** Quick match: how long a lone player waits for others before opponents are filled in. */
export const QUICK_MATCH_WAIT_MS = 10_000;

export const NAME_MAX_LENGTH = 16;

/** Player slot colours. Slot numbers (P1..P4) are always shown next to the colour. */
export const PLAYER_COLORS = [
  { hex: "#E2443A", label: "Red" },
  { hex: "#3D7FE0", label: "Blue" },
  { hex: "#3FA34D", label: "Green" },
  { hex: "#F2B21E", label: "Yellow" },
] as const;

export const Phase = {
  Waiting: "waiting",
  Lobby: "lobby",
  Countdown: "countdown",
  Playing: "playing",
  RoundOver: "roundOver",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];
