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
} as const;
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
}

export interface EliminatedPayload {
  sessionId: string;
  name: string;
  reason: EliminationReason;
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
  /** Initial character look (see appearance.ts); validated by the server. */
  appearance?: { hair: number; hairColor: number; face: number; outfit: number };
  private?: boolean;
  maxPlayers?: number;
}
