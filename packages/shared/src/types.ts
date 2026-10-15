import type { Phase } from "./constants.js";

/** Shape of a player in the Colyseus-synchronized state, as seen by the client. */
export interface SyncedPlayer {
  sessionId: string;
  name: string;
  colorIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  alive: boolean;
  connected: boolean;
  dashing: boolean;
  dashCooldownMs: number;
  /** Length of the current cooldown (shorter late in the bout), for the recharge meter. */
  dashCooldownTotalMs: number;
  placement: number;
  elimReason: string;
  /** True only in private rooms, where the host manages bots. Always false in quick match. */
  isBot: boolean;
  hair: number;
  hairColor: number;
  face: number;
  outfit: number;
}

/** Minimal read-only view of a Colyseus MapSchema. */
export interface SyncedMap<T> {
  get(key: string): T | undefined;
  forEach(callback: (value: T, key: string) => void): void;
  readonly size: number;
}

/** Shape of the room state, as seen by the client. */
export interface SyncedState {
  players: SyncedMap<SyncedPlayer>;
  phase: Phase;
  phaseRemainingMs: number;
  hostId: string;
  winnerId: string;
  isDraw: boolean;
  round: number;
  maxPlayers: number;
  isPrivate: boolean;
  aliveCount: number;
  /** Quick match: time left before opponents are filled in (0 when not searching). */
  searchRemainingMs: number;
  /** Arena of this room ("training", "rookie", … or "private"). */
  arenaId: string;
  botLevel: string;
  standings: Iterable<string>;
}
