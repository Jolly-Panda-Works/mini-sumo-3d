/**
 * Framework-free game simulation, shared with the web client's offline mode.
 * Nothing exported here may depend on Colyseus or Node.js APIs.
 */
export { GameSession, type ActionResult, type SessionEvent, type SessionOptions, type SessionPlayer } from "./game/GameSession.js";
export { DEFAULT_CONFIG, createConfig, type SimulationConfig } from "./simulation/SimulationConfig.js";
export { isDashing, isStunned } from "./simulation/MovementSystem.js";
