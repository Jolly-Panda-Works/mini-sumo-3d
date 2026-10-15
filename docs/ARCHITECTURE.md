# Mini Sumo architecture

Technical notes for contributors. For playing and building, see the [README](../README.md).

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Browser (static hosting)"]
    UI["React UI<br/>menu · lobby · HUD · results"]
    Scene["React Three Fiber scene<br/>arena · sumos · effects · camera"]
    Input["InputController<br/>keyboard + touch"]
    RM["RoomManager<br/>colyseus.js"]
    Input -- "direction, dash" --> RM
    RM -- "UI snapshot (store)" --> UI
    RM -- "live state (read per frame)" --> Scene
    RM -- "impact / dash / eliminated" --> Scene
  end
  subgraph Server["Node.js host"]
    Room["MiniSumoRoom<br/>(Colyseus adapter)"]
    Session["GameSession<br/>phases · host · players"]
    Sim["Simulation systems<br/>Movement · Collision · Arena · Match"]
    Room --> Session --> Sim
  end
  RM <-- "WebSocket: input messages ↑ / schema patches + events ↓" --> Room
```

```
mini-sumo/
├─ package.json              npm workspaces + root scripts
├─ tsconfig.base.json
├─ .env.example
├─ packages/shared/src/      constants, message names, synced state types, math helpers
├─ apps/server/
│  ├─ src/index.ts           HTTP server + Colyseus + room registration
│  ├─ src/rooms/MiniSumoRoom.ts   thin Colyseus adapter
│  ├─ src/state/MiniSumoState.ts  @colyseus/schema state
│  ├─ src/game/GameSession.ts     framework-free authoritative game (testable)
│  ├─ src/simulation/        SimulationConfig, SimBody, Movement, Collision, Arena, Match systems
│  ├─ src/validation/        InputValidator
│  └─ test/                  vitest suites
├─ apps/desktop/           Electron shell (main.cjs) + electron-builder config
├─ apps/mobile/            Capacitor config + Android icon/splash sources
├─ .github/workflows/build.yml   CI: test, web, desktop, Android, release
└─ apps/client/
   ├─ index.html, vite.config.ts
   └─ src/
      ├─ network/RoomManager.ts   connection, matchmaking, state → stores, events → effects/audio
      ├─ input/InputController.ts keyboard + touch → normalized direction
      ├─ game/                    GameCanvas, Arena, SumoModel, NetSumo, MenuSumos, Effects, CameraRig
      ├─ ui/                      MainMenu, Lobby, HUD, Countdown, Results, SettingsPanel, TouchControls, Toasts
      ├─ audio/AudioManager.ts    synthesized Web Audio effects
      └─ styles.css
```

Design decisions:

- **Simulation is framework-free.** `GameSession` and the systems operate on plain objects with an injected fixed-step clock. The Colyseus room only forwards messages, copies session data into the schema and broadcasts events. This is what makes the room logic unit-testable without a running server, and keeps a future engine or transport change cheap.
- **Rendering is separate from simulation.** Server coordinates are `(x, y)` metres on the ring floor; the client maps them to three.js `(x, 0, y)`. The 3D models, falls and effects are cosmetic and never feed back into gameplay.
- **React re-renders are rare.** The scene reads the live Colyseus state inside `useFrame`; React components only re-render from a low-frequency UI snapshot (phase, timer at 100 ms resolution, roster), compared by value before notifying.

## Multiplayer architecture

- **Authority:** the server owns membership, host, spawn positions, phases, timers, physics, dash cooldowns, eliminations, winners and rematches. Clients send only `input {x, y}` (direction), `dash`, `start`, `rematch` and `returnToLobby`. Positions, eliminations or winners sent by a client are not accepted by any handler.
- **Identity:** every message is attributed via the Colyseus `client.sessionId`; no client-supplied ids are trusted. Host checks compare against the server's `hostId`.
- **Tick:** fixed 30 Hz steps (`SimulationConfig.tickRate`) driven by `setSimulationInterval`, with an accumulator, a cap of 4 steps per update and a 250 ms clamp on real deltas after stalls. Patch rate is also ~30 Hz.
- **Synced state:** per player `sessionId, name, colorIndex, x, y, vx, vy, angle, alive, connected, dashing, dashCooldownMs, placement, elimReason, isBot, hair, hairColor, face, outfit`; per room `phase, phaseRemainingMs, hostId, winnerId, isDraw, round, maxPlayers, isPrivate, aliveCount, standings`. Particles, camera and animation are client-only.
- **Transient events** are Colyseus messages: `impact` (position + strength), `dash`, `eliminated`, `error`.
- **Smoothing:** the client exponentially interpolates each sumo toward the latest server position. There is **no client-side prediction**; your own wrestler responds after one round trip.
- **Validation:** inputs must be finite numbers; they are clamped to [-1, 1], normalised, and a deadzone is applied. Names are trimmed, stripped of control and bidi characters and limited to 16 characters. Each client has a token bucket (burst 30, 60 messages/s). Dash requests are checked for phase, alive state and cooldown.

## Room lifecycle

| Situation | Behaviour |
| --- | --- |
| Room created | `maxPlayers` clamped to 2–4. `private: true` calls `setPrivate(true)` so the room is hidden from quick match but joinable by id. |
| Join while waiting/lobby | Accepted until the room is full. Colours fill the lowest free slot. First player is host. |
| Join during countdown/match/results | Rejected with "A match is in progress…". The room is also `lock()`ed from countdown until it returns to the lobby. |
| Leave in waiting/lobby | Player removed. Phase re-evaluated (`lobby` needs 2+). |
| Leave during countdown | Player removed; countdown aborts to lobby/waiting if fewer than 2 remain. |
| Leave or disconnect during a bout | Player is eliminated with reason `left`, kept for standings, removed when the room returns to the lobby. If one player remains, they win. |
| Leave during results | Marked disconnected, removed on return to lobby or rematch. |
| Host leaves | Host moves to the earliest-joined connected player. |
| Everyone leaves | Colyseus auto-disposes the room. |
| Quick match (public room) | A lone player waits up to 30 s (`quickMatchWaitMs`). If no other human joins, bots fill the room to its limit and the countdown starts automatically. A second human joining cancels the wait. On *Rematch* the bots stay; on returning to the lobby they are removed and the wait starts again. |
| Bots in private rooms | The host adds or removes bots in the lobby (`addBot`, `removeBot { id }`). Bots count toward the player limit and can never be host. |
| Reconnection | **Not supported.** Any disconnect is final; rejoin with the invite link while the room is in its lobby. |

## Bots

Bots live entirely on the server (`apps/server/src/game/BotBrain.ts`). Every 120–280 ms of simulation time a bot picks a direction and, sometimes, a dash. That input is applied exactly like validated human input and runs through the same `stepMovement`, collision and dash rules, so bots can't do anything a human can't.

- Target choice: the opponent that is close and near the edge.
- Approach from the centre side, then charge outward through the target; dash when close and aligned.
- Edge safety: the closer a bot is to the rope (from 72 % of the radius), the more it steers back.
- Random noise and the reaction delay keep it beatable.

Quick-match bots get ordinary names (`botNames.ts`) and ids shaped like Colyseus session ids, and `isBot` is never sent for quick-match rooms, so they look like everyone else. In private rooms `isBot` is synced so the host can manage them.

## Character customisation

The look is four small indexes (`hair`, `hairColor`, `face`, `outfit`) defined in `packages/shared/src/appearance.ts`. The client saves them in settings, sends them in the join options and with `setAppearance` while in the lobby. The server validates every field with `sanitizeAppearance` (out-of-range values fall back to the default), only accepts changes in `waiting`/`lobby`, and syncs them per player. The belt colour is never customisable: it is the slot colour, which keeps players identifiable together with the P1–P4 number.

## Offline mode

`apps/server/src/sim.ts` exports the framework-free parts of the server (`GameSession`, config, helpers). The web client imports them through the `@mini-sumo/sim` alias (Vite `resolve.alias` + TypeScript `paths`), so offline mode runs the exact same rules as the server instead of a separate client-side copy.

`apps/client/src/network/connection.ts` defines `GameConnection`, the small surface `RoomManager` uses (`send`, `onStateChange`, `onMessage`, `leave`, live `state`). Two implementations:

- `wrapColyseusRoom(room)`: the online Colyseus room.
- `LocalConnection`: a `GameSession` ticking at 30 Hz in the browser, mirroring `MiniSumoRoom.syncState` into a plain object with the `SyncedState` shape and emitting the same `impact`/`dash`/`eliminated`/`error` messages. Offline quick match uses a 4 s search before bots fill the ring.

`networkMode.ts` decides the mode (`VITE_NETWORK_MODE`, missing `VITE_SERVER_URL` in production, or a `/health` probe), and `RoomManager` falls back to a `LocalConnection` when joining fails because the server is unreachable.
