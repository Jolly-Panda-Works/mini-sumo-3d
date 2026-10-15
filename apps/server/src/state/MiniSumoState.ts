import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

/** Synchronized per-player data. Only what clients need for rendering and UI. */
export class PlayerState extends Schema {
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("uint8") colorIndex = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") vx = 0;
  @type("float32") vy = 0;
  @type("float32") angle = 0;
  @type("boolean") alive = true;
  @type("boolean") connected = true;
  @type("boolean") dashing = false;
  /** Remaining dash cooldown, rounded up to 100 ms to limit patch traffic. */
  @type("uint16") dashCooldownMs = 0;
  @type("uint16") dashCooldownTotalMs = 3000;
  @type("uint8") placement = 0;
  @type("string") elimReason = "";
  /** Only true in private rooms (the host manages bots there). Never set in quick match. */
  @type("boolean") isBot = false;
  /** Appearance indexes (see packages/shared appearance.ts). */
  @type("uint8") hair = 0;
  @type("uint8") hairColor = 0;
  @type("uint8") face = 0;
  @type("uint8") outfit = 0;
}

export class MiniSumoState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("string") phase = "waiting";
  /** Server-authoritative time left in the current phase, rounded up to 100 ms. */
  @type("uint32") phaseRemainingMs = 0;
  @type("string") hostId = "";
  @type("string") winnerId = "";
  @type("boolean") isDraw = false;
  @type("uint16") round = 0;
  @type("uint8") maxPlayers = 4;
  @type("boolean") isPrivate = false;
  @type("uint8") aliveCount = 0;
  /** Quick match: time left before opponents are filled in, rounded up to 100 ms. */
  @type("uint32") searchRemainingMs = 0;
  /** Arena of this room (training, rookie, pro, champion or private). */
  @type("string") arenaId = "training";
  /** Bot difficulty ("easy" | "normal" | "hard"; empty in paid arenas). */
  @type("string") botLevel = "normal";
  /** Session ids ordered by final placement (filled when a round ends). */
  @type(["string"]) standings = new ArraySchema<string>();
}
