# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

Builds from `main` are released automatically as `MAJOR.MINOR.<build number>`; tagged releases (`vX.Y.Z`) use the tag exactly.

## [Unreleased]

### Added

- Virtual-currency economy (server-authoritative): device-bound guest accounts, Sumo Coin wallet, append-only ledger with idempotency keys, SQLite persistence via `node:sqlite`.
- Arenas: free Training plus Rookie (100), Pro (500) and Champion (2,000) entry tiers. Entry fees charged atomically on join, winner paid the pool minus a 10 % economy fee, draws and unstarted bouts refunded, settlement exactly once per match, startup recovery refunds.
- Free rewards in the Training Arena with a daily first-bout bonus and a daily cap.
- Cosmetic shop inside the existing wardrobe: priced items, try-on preview, idempotent purchases, owned-only equipping enforced by the server.
- Arena selection, wallet and transaction history screens; prize and refund summary on the results screen.
- Feature flags for economy, shop, premium currency (off) and real-money purchases (off); provider-independent payment boundary that always refuses.
- Economy event log lines for future balancing.

### Changed

- Node.js 22.13 or newer is required.

### Fixed

- Phones: the arena looked washed out behind a pale layer. The fog used fixed distances while portrait screens put the camera much farther away; fog now follows the camera distance.
- Phones: wider field of view in portrait so the camera comes about a third closer (bigger wrestlers), and the ring sits lower, in the free space below the HUD.

### Added

- Offline practice mode: while no online server is available, every room runs locally in the client with the same GameSession as the server, against bots. Production builds without `VITE_SERVER_URL` start offline; online builds fall back to offline when the server can't be reached. `VITE_NETWORK_MODE` forces `online`, `offline` or `auto`.

### Changed

- Mobile controls: floating joystick that appears under your thumb anywhere on the left side (or a fixed corner stick), a larger dash button with a countdown, vibration on dashes, hits and ring-outs, and controls hide once you are out of the round. New settings: *Joystick* and *Vibration*.

### Fixed

- *Play now* always failed with "That room is full or a match is already running": the room assigned to Colyseus' read-only `locked` property while being created.
- The first-launch name prompt now covers the game with a dark backdrop and nothing else is shown behind it.

### Added

- Bots: the host of a private room can add and remove computer-controlled wrestlers in the lobby.
- Quick match: *Play now* waits up to 30 seconds for other players, then fills the room with bots (ordinary random names, same look as players) and starts automatically.
- First-launch name prompt; the name is saved for next time.
- Character customisation before a match: hair style and colour, face and outfit, with a live 3D preview. The look is saved, sent when joining and synced to everyone; the belt keeps the player colour. Bots get a random look.

## [0.1.0] - 2026-10-15

### Added

- 3D multiplayer sumo party game for 2 to 4 players, rendered with React Three Fiber.
- Authoritative Colyseus server: quick match, private rooms, invite links, host controls, rematch.
- Momentum-based pushing, dash with cooldown, ring-outs, timeout tiebreaker, draws and standings.
- Keyboard and touch controls, synthesised sound effects, settings and an About section.
- Desktop apps (Windows, macOS, Linux) with Electron and an Android app with Capacitor.
- GitHub Actions: tests, web build with optional GitHub Pages deploy, desktop and Android builds, automatic releases with checksums, screenshot workflow.
- Standalone server package with a step-by-step Ubuntu deployment guide (Persian).

[Unreleased]: https://github.com/Jolly-Panda-Works/mini-sumo-3d/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Jolly-Panda-Works/mini-sumo-3d/releases/tag/v0.1.0
