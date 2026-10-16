import { describe, expect, it } from "vitest";
import { Phase } from "@mini-sumo/shared";
import { decideBot } from "../src/game/BotBrain.js";
import { BOT_NAMES, createRng, pickBotName } from "../src/game/botNames.js";
import { GameSession } from "../src/game/GameSession.js";
import { createConfig } from "../src/simulation/SimulationConfig.js";
import { advance, body, cfg } from "./helpers.js";

const quick = (overrides = {}) => new GameSession(createConfig(overrides), 4, { quickMatch: true, seed: 7 });
const privateRoom = () => new GameSession(cfg, 4, { seed: 7 });

describe("bot brain", () => {
  it("moves toward an opponent", () => {
    const bot = body("bot", -2, 0);
    const target = body("t", 2, 0);
    const d = decideBot(bot, [bot, target], cfg, createRng(1));
    expect(d.x).toBeGreaterThan(0.5);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(0.9, 6); // normal level input scale
  });

  it("steers back to the centre near the edge", () => {
    const bot = body("bot", cfg.arenaRadius - 0.3, 0);
    const target = body("t", cfg.arenaRadius + 0.5, 0.5);
    const d = decideBot(bot, [bot, target], cfg, createRng(2));
    expect(d.x).toBeLessThan(0);
    expect(d.dash).toBe(false);
  });

  it("returns a valid direction with no opponents", () => {
    const bot = body("bot", 3, 0);
    const d = decideBot(bot, [bot], cfg, createRng(3));
    expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
    expect(d.x).toBeLessThan(0);
  });

  it("can push an idle player out of the ring", () => {
    const s = privateRoom();
    s.addPlayer("human", "Human");
    expect(s.addBot("human").ok).toBe(true);
    s.requestStart("human");
    advance(s, cfg.countdownMs + 100);
    expect(s.phase).toBe(Phase.Playing);
    for (let t = 0; t < 30_000 && s.phase === Phase.Playing; t += s.stepMs) s.update(s.stepMs);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.players.get("human")!.alive).toBe(false);
    const bot = s.bots[0]!;
    expect(s.winnerId).toBe(bot.id);
  });
});

describe("bot names", () => {
  it("are ordinary unused names", () => {
    const rng = createRng(4);
    const name = pickBotName(["Kenta", "mika"], rng);
    expect((BOT_NAMES as readonly string[]).includes(name)).toBe(true);
    expect(["kenta", "mika"].includes(name.toLowerCase())).toBe(false);
  });
});

describe("private room bots", () => {
  it("host can add and remove bots in the lobby", () => {
    const s = privateRoom();
    s.addPlayer("host", "Host");
    expect(s.phase).toBe(Phase.Waiting);
    expect(s.addBot("host").ok).toBe(true);
    expect(s.phase).toBe(Phase.Lobby);
    const bot = s.bots[0]!;
    expect(bot.isBot).toBe(true);
    expect(bot.id).toHaveLength(9);
    expect(s.removeBot("host", bot.id).ok).toBe(true);
    expect(s.bots).toHaveLength(0);
    expect(s.phase).toBe(Phase.Waiting);
  });

  it("only the host can manage bots, never humans", () => {
    const s = privateRoom();
    s.addPlayer("host", "Host");
    s.addPlayer("guest", "Guest");
    expect(s.addBot("guest").ok).toBe(false);
    expect(s.removeBot("host", "guest").ok).toBe(false);
    expect(s.players.has("guest")).toBe(true);
  });

  it("bots count toward the player limit", () => {
    const s = new GameSession(cfg, 2, { seed: 1 });
    s.addPlayer("host", "Host");
    expect(s.addBot("host").ok).toBe(true);
    expect(s.addBot("host").ok).toBe(false);
    expect(s.addPlayer("late", "Late").ok).toBe(false);
  });

  it("bots cannot be added during a match and never become host", () => {
    const s = privateRoom();
    s.addPlayer("host", "Host");
    s.addBot("host");
    s.addPlayer("guest", "Guest");
    s.requestStart("host");
    expect(s.addBot("host").ok).toBe(false);
    s.removePlayer("host");
    expect(s.hostId).toBe("guest");
  });

  it("bots are not added automatically in private rooms", () => {
    const s = privateRoom();
    s.addPlayer("host", "Host");
    advance(s, cfg.quickMatchWaitMs + 1000);
    expect(s.bots).toHaveLength(0);
    expect(s.phase).toBe(Phase.Waiting);
  });
});

describe("quick match", () => {
  it("a lone player gets bots after the wait, then starts the match", () => {
    const s = quick();
    s.addPlayer("me", "Usef");
    expect(s.searchRemainingMs).toBe(cfg.quickMatchWaitMs);
    advance(s, cfg.quickMatchWaitMs - 500);
    expect(s.phase).toBe(Phase.Waiting);
    expect(s.searchRemainingMs).toBeGreaterThan(0);
    advance(s, 600);
    expect(s.phase).toBe(Phase.Lobby);
    expect(s.requestStart("me").ok).toBe(true);
    expect(s.phase).toBe(Phase.Countdown);
    expect(s.connectedPlayers).toHaveLength(4);
    expect(s.bots).toHaveLength(3);
    expect(s.players.get("me")!.name).toBe("Usef");
    expect(s.players.get("me")!.colorIndex).toBe(0);
    expect(s.hostId).toBe("me");
  });

  it("a second player joining cancels the bot fill", () => {
    const s = quick();
    s.addPlayer("a", "A");
    advance(s, 10_000);
    s.addPlayer("b", "B");
    expect(s.searchRemainingMs).toBe(0);
    advance(s, cfg.quickMatchWaitMs + 1000);
    expect(s.bots).toHaveLength(0);
    expect(s.phase).toBe(Phase.Lobby);
  });

  it("the wait restarts when the room is lonely again", () => {
    const s = quick();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    advance(s, 5000);
    s.removePlayer("b");
    expect(s.searchRemainingMs).toBeCloseTo(cfg.quickMatchWaitMs, 3);
  });

  it("host cannot add bots manually in quick match", () => {
    const s = quick();
    s.addPlayer("a", "A");
    expect(s.addBot("a").ok).toBe(false);
  });

  it("rematch keeps the bots, returning to the lobby removes them and searches again", () => {
    const s = quick({ matchDurationMs: 2000 });
    s.addPlayer("me", "Me");
    advance(s, cfg.quickMatchWaitMs + 100);
    s.requestStart("me");
    advance(s, cfg.countdownMs + 3000);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.requestRematch("me").ok).toBe(true);
    expect(s.bots).toHaveLength(3);
    advance(s, cfg.countdownMs + 3000);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.requestReturnToLobby("me").ok).toBe(true);
    expect(s.bots).toHaveLength(0);
    expect(s.phase).toBe(Phase.Waiting);
    expect(s.searchRemainingMs).toBeCloseTo(cfg.quickMatchWaitMs, 3);
  });

  it("bots play by the same rules: inputs stay normalized and positions finite", () => {
    const s = quick();
    s.addPlayer("me", "Me");
    advance(s, cfg.quickMatchWaitMs + 100);
    s.requestStart("me");
    advance(s, cfg.countdownMs + 100);
    for (let i = 0; i < 300; i++) {
      s.update(s.stepMs);
      for (const p of s.players.values()) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(Math.hypot(p.inputX, p.inputY)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});
