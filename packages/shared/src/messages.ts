/** Messages sent from client to server. All payloads are treated as untrusted. */
export const ClientMessage = {
  Input: "input",
  Dash: "dash",
  StartMatch: "start",
  Rematch: "rematch",
  ReturnToLobby: "returnToLobby",
  /** Host of a private room: add a computer-controlled wrestler. */
  AddBot: "addBot",
  /** Host of a private room: remove a computer-controlled wrestler ({ id }). */
  RemoveBot: "removeBot",
  /** Change your own appearance (lobby only). Payload: Appearance. */
  SetAppearance: "setAppearance",
} as const;
export type ClientMessage = (typeof ClientMessage)[keyof typeof ClientMessage];

/** Transient events broadcast by the server (not part of the synchronized state). */
export const ServerMessage = {
  Impact: "impact",
  Eliminated: "eliminated",
  Dash: "dash",
  Error: "error",
  /** Personal economy result (EconomyResultMessage): prize, refund or rewards. */
  Economy: "economy",
  /** The room is closing (RoomClosedPayload), e.g. the host of a private room left. */
  RoomClosed: "roomClosed",
} as const;

export interface RoomClosedPayload {
  reason: "host_left";
  /** The host's name, for the message. */
  hostName: string;
}
export type ServerMessage = (typeof ServerMessage)[keyof typeof ServerMessage];

/** Normalized movement direction. x: right, y: toward the camera (screen down). */
export interface InputPayload {
  x: number;
  y: number;
}

export type EliminationReason = "ringOut" | "left";

export interface ImpactPayload {
  a: string;
  b: string;
  x: number;
  y: number;
  strength: number;
  /** The wrestler stunned by this hit (a dash into someone who wasn't dashing). */
  stunned?: string;
}

export interface EliminatedPayload {
  sessionId: string;
  name: string;
  reason: EliminationReason;
  /** Who pushed them out (last contact), if anyone. */
  by?: string | null;
}

export interface DashPayload {
  sessionId: string;
}

export interface RemoveBotPayload {
  id: string;
}

export interface ErrorPayload {
  message: string;
}

/** Options accepted by client.create / joinOrCreate / joinById. */
export interface JoinOptions {
  name?: string;
  /** Guest account token (economy). Never a player id: the server resolves the account. */
  authToken?: string;
  /** Arena to play in (see /api/catalog). Defaults to the free training arena. */
  arenaId?: string;
  /** Bot difficulty for rooms that use bots: "easy" | "normal" | "hard". */
  botLevel?: string;
  /** The player's level (offline rooms; online the server uses the account's level). */
  level?: number;
  /** Initial character look (see appearance.ts); validated by the server. */
  appearance?: { hair: number; hairColor: number; face: number; outfit: number };
  private?: boolean;
  maxPlayers?: number;
}
