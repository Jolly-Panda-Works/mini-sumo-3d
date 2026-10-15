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
  placement: number;
  elimReason: string;
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
  standings: Iterable<string>;
}
