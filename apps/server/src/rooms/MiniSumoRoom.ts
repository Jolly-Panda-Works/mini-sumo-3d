import { Room, ServerError, type Client } from "colyseus";
import { ClientMessage, Phase, ServerMessage, type ErrorPayload, type JoinOptions } from "@mini-sumo/shared";
import { GameSession, type ActionResult } from "../game/GameSession.js";
import { isDashing } from "../simulation/MovementSystem.js";
import { DEFAULT_CONFIG } from "../simulation/SimulationConfig.js";
import { sanitizeIsPrivate, sanitizeMaxPlayers } from "../validation/InputValidator.js";
import { MiniSumoState, PlayerState } from "../state/MiniSumoState.js";

const roundUp100 = (ms: number) => Math.ceil(ms / 100) * 100;

/**
 * Thin Colyseus adapter around GameSession:
 * client messages -> session actions, session -> schema state, session events -> broadcasts.
 */
export class MiniSumoRoom extends Room<MiniSumoState> {
  private session!: GameSession;
  private standingsKey = "";
  /**
   * Our own record of the matchmaking lock. Must not be called `locked`: Colyseus' Room
   * already has a read-only `locked` getter, and assigning to it throws while the room is
   * being created (which made every quick match fail).
   */
  private matchmakingLocked = false;

  override onCreate(options: JoinOptions = {}): void {
    const maxPlayers = sanitizeMaxPlayers(options.maxPlayers);
    const isPrivate = sanitizeIsPrivate(options.private);

    this.state = new MiniSumoState();
    this.maxClients = maxPlayers;
    // Public rooms are quick-match rooms: a lone player gets bots after a short wait.
    this.session = new GameSession(DEFAULT_CONFIG, maxPlayers, { quickMatch: !isPrivate });
    this.state.maxPlayers = maxPlayers;
    this.state.isPrivate = isPrivate;
    // Private rooms are excluded from joinOrCreate, but still joinable by id.
    if (isPrivate) void this.setPrivate(true);

    this.setPatchRate(1000 / DEFAULT_CONFIG.tickRate);

    this.onMessage(ClientMessage.Input, (client, message: unknown) => {
      this.session.handleInput(client.sessionId, message);
    });
    this.onMessage(ClientMessage.Dash, (client) => {
      // Rejected dashes (cooldown, wrong phase) are silently ignored; the HUD shows cooldown.
      this.session.handleDash(client.sessionId);
      this.flushEvents();
    });
    this.onMessage(ClientMessage.StartMatch, (client) => {
      this.reply(client, this.session.requestStart(client.sessionId));
    });
    this.onMessage(ClientMessage.Rematch, (client) => {
      this.reply(client, this.session.requestRematch(client.sessionId));
    });
    this.onMessage(ClientMessage.ReturnToLobby, (client) => {
      this.reply(client, this.session.requestReturnToLobby(client.sessionId));
    });
    this.onMessage(ClientMessage.SetAppearance, (client, message: unknown) => {
      this.reply(client, this.session.setAppearance(client.sessionId, message));
    });
    this.onMessage(ClientMessage.AddBot, (client) => {
      this.reply(client, this.session.addBot(client.sessionId));
    });
    this.onMessage(ClientMessage.RemoveBot, (client, message: unknown) => {
      const id = typeof message === "object" && message !== null ? (message as Record<string, unknown>).id : undefined;
      this.reply(client, this.session.removeBot(client.sessionId, id));
    });

    this.setSimulationInterval((deltaTime) => {
      this.session.update(deltaTime);
      this.flushEvents();
      this.syncState();
    }, 1000 / DEFAULT_CONFIG.tickRate);

    this.syncState();
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const result = this.session.addPlayer(client.sessionId, options.name, options.appearance);
    if (!result.ok) throw new ServerError(4003, result.error);
    this.flushEvents();
    this.syncState();
  }

  override onLeave(client: Client): void {
    // Reconnection is not supported in this MVP: any leave (consented or not) is final.
    this.session.removePlayer(client.sessionId);
    this.flushEvents();
    this.syncState();
  }

  override onDispose(): void {
    // Nothing persistent to clean up; timers are owned by the room clock.
  }

  private reply(client: Client, result: ActionResult): void {
    if (!result.ok) {
      const payload: ErrorPayload = { message: result.error };
      client.send(ServerMessage.Error, payload);
    }
    this.flushEvents();
    this.syncState();
  }

  private flushEvents(): void {
    for (const event of this.session.drainEvents()) {
      switch (event.type) {
        case "impact":
          this.broadcast(ServerMessage.Impact, {
            a: event.a,
            b: event.b,
            x: event.x,
            y: event.y,
            strength: Math.round(event.strength * 10) / 10,
          });
          break;
        case "eliminated":
          this.broadcast(ServerMessage.Eliminated, { sessionId: event.id, name: event.name, reason: event.reason });
          break;
        case "dash":
          this.broadcast(ServerMessage.Dash, { sessionId: event.id });
          break;
        case "phase":
          break;
        case "roundOver":
          break;
      }
    }
  }

  /**
   * Lock the room for matchmaking while a match runs or while bots fill it, so new players
   * are routed elsewhere; unlock in the lobby when there is space again.
   */
  private updateLock(): void {
    const s = this.session;
    const inLobby = s.phase === Phase.Lobby || s.phase === Phase.Waiting;
    const shouldLock = !inLobby || s.connectedPlayers.length >= s.maxPlayers;
    if (shouldLock === this.matchmakingLocked) return;
    this.matchmakingLocked = shouldLock;
    if (shouldLock) void this.lock();
    else if (this.clients.length < this.maxClients) void this.unlock();
    else this.matchmakingLocked = true;
  }

  private syncState(): void {
    const s = this.session;
    const state = this.state;
    state.phase = s.phase;
    state.phaseRemainingMs = roundUp100(s.phaseRemainingMs);
    state.hostId = s.hostId;
    state.winnerId = s.winnerId;
    state.isDraw = s.isDraw;
    state.round = s.round;
    state.aliveCount = s.alivePlayers.length;
    state.searchRemainingMs = roundUp100(s.searchRemainingMs);

    for (const id of [...state.players.keys()]) {
      if (!s.players.has(id)) state.players.delete(id);
    }
    for (const [id, p] of s.players) {
      let ps = state.players.get(id);
      if (!ps) {
        ps = new PlayerState();
        ps.sessionId = id;
        state.players.set(id, ps);
      }
      ps.name = p.name;
      ps.colorIndex = p.colorIndex;
      ps.x = p.x;
      ps.y = p.y;
      ps.vx = p.vx;
      ps.vy = p.vy;
      ps.angle = p.angle;
      ps.alive = p.alive;
      ps.connected = p.connected;
      ps.dashing = isDashing(p, s.time);
      ps.dashCooldownMs = Math.min(65_000, roundUp100(Math.max(0, p.dashReadyAt - s.time)));
      ps.placement = p.placement;
      ps.elimReason = p.elimReason;
      // Quick-match bots are indistinguishable from players on the wire.
      ps.isBot = p.isBot && !s.quickMatch;
      ps.hair = p.appearance.hair;
      ps.hairColor = p.appearance.hairColor;
      ps.face = p.appearance.face;
      ps.outfit = p.appearance.outfit;
    }

    this.updateLock();

    const key = s.standings.join(",");
    if (key !== this.standingsKey) {
      this.standingsKey = key;
      state.standings.clear();
      for (const id of s.standings) state.standings.push(id);
    }
  }
}
