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
    advance(s, (cfg.entranceMs + cfg.countdownMs) + 100);
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

  it("the host can add bots in Training too (not in paid arenas)", () => {
    const training = new GameSession(cfg, 4, { quickMatch: true, seed: 2, botLevel: "normal" });
    training.addPlayer("host", "Host");
    expect(training.addBot("host").ok).toBe(true);
    const paid = new GameSession(cfg, 4, { quickMatch: true, seed: 2, paidArena: { startDelayMs: 5000, cancelAfterMs: 60000 } });
    paid.addPlayer("host", "Host");
    expect(paid.addBot("host").ok).toBe(false);
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
    // Bots join one by one, each at its ring-side slot.
    expect(s.bots).toHaveLength(1);
    expect(s.searchRemainingMs).toBeGreaterThan(0);
    advance(s, cfg.botJoinIntervalMs * 2 + 100);
    expect(s.bots).toHaveLength(3);
    expect(s.searchRemainingMs).toBe(0);
    for (const bot of s.bots) expect(Math.hypot(bot.x, bot.y)).toBeCloseTo(cfg.arenaRadius * cfg.lobbyRadiusFactor, 3);
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
    advance(s, cfg.quickMatchWaitMs / 2);
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

  it("rematch keeps the bots, returning to the lobby removes them and searches again", () => {
    const s = quick({ matchDurationMs: 2000 });
    s.addPlayer("me", "Me");
    advance(s, cfg.quickMatchWaitMs + cfg.botJoinIntervalMs * 3 + 100);
    s.requestStart("me");
    advance(s, (cfg.entranceMs + cfg.countdownMs) + 3000);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.requestRematch("me").ok).toBe(true);
    expect(s.bots).toHaveLength(3);
    advance(s, (cfg.entranceMs + cfg.countdownMs) + 3000);
    expect(s.phase).toBe(Phase.RoundOver);
    expect(s.requestReturnToLobby("me").ok).toBe(true);
    expect(s.bots).toHaveLength(0);
    expect(s.phase).toBe(Phase.Waiting);
    expect(s.searchRemainingMs).toBeCloseTo(cfg.quickMatchWaitMs, 3);
  });

  it("bots play by the same rules: inputs stay normalized and positions finite", () => {
    const s = quick();
    s.addPlayer("me", "Me");
    advance(s, cfg.quickMatchWaitMs + cfg.botJoinIntervalMs * 3 + 100);
    s.requestStart("me");
    advance(s, (cfg.entranceMs + cfg.countdownMs) + 100);
    for (let i = 0; i < 300; i++) {
      s.update(s.stepMs);
      for (const p of s.players.values()) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(Math.hypot(p.inputX, p.inputY)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe("bots-only finish", () => {
  it("one of the last two bots gives up, so the bout ends well before the clock", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = new GameSession(cfg, 4, { quickMatch: true, seed, botLevel: "hard" });
      s.addPlayer("me", "Me");
      advance(s, cfg.quickMatchWaitMs + cfg.botJoinIntervalMs * 3 + 100);
      s.requestStart("me");
      advance(s, cfg.entranceMs + cfg.countdownMs + 50);
      expect(s.phase).toBe(Phase.Playing);
      s.removePlayer("me"); // the human is out
      const bots = s.bots;
      // Leave two bots in the ring.
      const third = bots[2]!;
      third.x = cfg.arenaRadius + 2;
      const start = s.time;
      while (s.phase === Phase.Playing && s.time - start < cfg.matchDurationMs) s.update(s.stepMs);
      expect(s.phase).toBe(Phase.RoundOver);
      expect(s.time - start).toBeLessThan(cfg.matchDurationMs * 0.75);
    }
  });
});

describe("bot moves", () => {
  it("bots don't only chase: they sometimes keep their distance, and lunge from afar", () => {
    let backedOff = 0;
    let lunges = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = new GameSession(cfg, 2, { seed, botLevel: "hard" });
      s.addPlayer("me", "Me");
      s.addBot("me");
      s.requestStart("me");
      while (s.phase !== Phase.Playing) s.update(s.stepMs);
      const bot = s.bots[0]!;
      const me = s.players.get("me")!;
      let lastDash = 0;
      for (let t = 0; t < 20_000 && s.phase === Phase.Playing; t += s.stepMs) {
        // A player who just stands in the middle.
        s.handleInput("me", { x: -me.x, y: -me.y });
        s.update(s.stepMs);
        if (!bot.alive || !me.alive) break;
        const gap = Math.hypot(bot.x - me.x, bot.y - me.y);
        // Moving away from the player on purpose.
        if (bot.inputX * (me.x - bot.x) + bot.inputY * (me.y - bot.y) < -0.2 * gap) backedOff++;
        if (bot.dashEndsAt > lastDash) {
          if (gap > cfg.playerRadius * 2.5) lunges++;
          lastDash = bot.dashEndsAt;
        }
      }
    }
    expect(backedOff).toBeGreaterThan(0);
    expect(lunges).toBeGreaterThan(0);
  });
});
