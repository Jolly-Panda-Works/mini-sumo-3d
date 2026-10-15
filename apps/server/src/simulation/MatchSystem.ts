import { Phase } from "@mini-sumo/shared";
import { distanceFromCenter } from "./ArenaSystem.js";
import type { SimBody } from "./SimBody.js";
import type { SimulationConfig } from "./SimulationConfig.js";

/**
 * Server-side phase state machine.
 *
 *   waiting <-> lobby -> countdown -> playing -> roundOver
 *   countdown -> lobby | waiting        (aborted: fewer than 2 players left)
 *   roundOver -> lobby | waiting        (return to lobby)
 *   roundOver -> countdown              (rematch)
 */
const ALLOWED_TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  [Phase.Waiting]: [Phase.Lobby],
  [Phase.Lobby]: [Phase.Waiting, Phase.Countdown],
  [Phase.Countdown]: [Phase.Playing, Phase.Lobby, Phase.Waiting],
  [Phase.Playing]: [Phase.RoundOver],
  [Phase.RoundOver]: [Phase.Lobby, Phase.Waiting, Phase.Countdown],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return from !== to && ALLOWED_TRANSITIONS[from].includes(to);
}

export type EndReason = "lastStanding" | "timeout";

export interface Outcome {
  winnerId: string | null;
  draw: boolean;
  /** Players sharing first place in a draw decided by the timeout tiebreaker. */
  tiedIds: string[];
}

/**
 * Winner rules:
 * 1. Exactly one player alive: that player wins.
 * 2. Nobody alive (simultaneous ring-outs in the same tick): draw.
 * 3. Timeout with 2+ alive: the player closest to the arena centre wins. If the two
 *    closest are within `timeoutDrawEpsilon` metres, it's a draw among everyone that close.
 */
export function determineOutcome(alive: readonly SimBody[], cfg: SimulationConfig): Outcome {
  if (alive.length === 1) return { winnerId: alive[0]!.id, draw: false, tiedIds: [] };
  if (alive.length === 0) return { winnerId: null, draw: true, tiedIds: [] };

  const ranked = alive
    .map((body) => ({ id: body.id, d: distanceFromCenter(body) }))
    .sort((p, q) => p.d - q.d || (p.id < q.id ? -1 : 1));
  const best = ranked[0]!;
  const second = ranked[1]!;
  if (second.d - best.d < cfg.timeoutDrawEpsilon) {
    const tiedIds = ranked.filter((r) => r.d - best.d < cfg.timeoutDrawEpsilon).map((r) => r.id);
    return { winnerId: null, draw: true, tiedIds };
  }
  return { winnerId: best.id, draw: false, tiedIds: [] };
}

export interface StandingInput {
  id: string;
  alive: boolean;
  eliminatedAt: number;
  x: number;
  y: number;
}

export interface Standing {
  id: string;
  placement: number;
}

/**
 * Final standings (competition ranking: 1, 1, 3, ...):
 * winner / tied players first, then players still in the ring at timeout ordered by
 * distance to the centre, then eliminated players ordered by elimination time (later is better).
 * Players eliminated in the same tick share a placement.
 */
export function computeStandings(players: readonly StandingInput[], outcome: Outcome): Standing[] {
  const top = new Set<string>(outcome.tiedIds);
  if (outcome.winnerId) top.add(outcome.winnerId);

  const keyed = players.map((p) => {
    if (top.has(p.id)) return { id: p.id, tier: 0, value: 0 };
    if (p.alive) return { id: p.id, tier: 1, value: distanceFromCenter(p) };
    return { id: p.id, tier: 2, value: -p.eliminatedAt };
  });
  keyed.sort((p, q) => p.tier - q.tier || p.value - q.value || (p.id < q.id ? -1 : 1));

  const standings: Standing[] = [];
  keyed.forEach((entry, index) => {
    const prev = keyed[index - 1];
    const tied = prev !== undefined && prev.tier === entry.tier && prev.value === entry.value;
    const placement = tied ? standings[index - 1]!.placement : index + 1;
    standings.push({ id: entry.id, placement });
  });
  return standings;
}
