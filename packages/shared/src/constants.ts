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
/** Quick match: how long a lone player waits for others before opponents are filled in. */
export const QUICK_MATCH_WAIT_MS = 30_000;

export const NAME_MAX_LENGTH = 16;

/** Player slot colours. Slot numbers (P1..P4) are always shown next to the colour. */
export const PLAYER_COLORS = [
  { hex: "#FF5D73", label: "Coral" },
  { hex: "#2EC4B6", label: "Teal" },
  { hex: "#FFC23C", label: "Sun" },
  { hex: "#8E6CEF", label: "Violet" },
] as const;

export const Phase = {
  Waiting: "waiting",
  Lobby: "lobby",
  Countdown: "countdown",
  Playing: "playing",
  RoundOver: "roundOver",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];
