import { Phase } from "@mini-sumo/shared";
import { GameSession } from "../src/game/GameSession.js";
import { createBody, type SimBody } from "../src/simulation/SimBody.js";
import { createConfig, type SimulationConfig } from "../src/simulation/SimulationConfig.js";

export const cfg: SimulationConfig = createConfig();

export function body(id: string, x = 0, y = 0, patch: Partial<SimBody> = {}): SimBody {
  return { ...createBody(id, x, y), ...patch };
}

/** Advance a session by `ms` using fixed-size updates. */
export function advance(session: GameSession, ms: number): void {
  const steps = Math.ceil(ms / session.stepMs);
  for (let i = 0; i < steps; i++) session.update(session.stepMs);
}

/** Session with the given players already in the Playing phase. */
export function playingSession(ids: string[] = ["a", "b"], overrides: Partial<SimulationConfig> = {}): GameSession {
  const session = new GameSession(createConfig(overrides), 4);
  for (const id of ids) session.addPlayer(id, id.toUpperCase());
  const start = session.requestStart(ids[0]!);
  if (!start.ok) throw new Error(start.error);
  advance(session, session.cfg.countdownMs + session.stepMs);
  if (session.phase !== Phase.Playing) throw new Error(`expected playing, got ${session.phase}`);
  session.drainEvents();
  return session;
}
