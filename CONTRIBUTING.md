# Contributing to Mini Sumo

Thanks for wanting to help! Bug reports, ideas, art, tuning feedback and code are all welcome.

## Ways to contribute

- **Play and report.** [Open an issue](https://github.com/Jolly-Panda-Works/mini-sumo-3d/issues/new/choose) for bugs or ideas. For bugs, include your platform (web browser, Windows, macOS, Linux, Android), the version from *Settings → About*, and steps to reproduce.
- **Tune the gameplay.** All physics and match values live in `apps/server/src/simulation/SimulationConfig.ts`. Suggestions backed by a short playtest description are great.
- **Fix or build something.** Look for issues labelled `good first issue` or `help wanted`, or open an issue first for larger changes so we can agree on the approach.

## Development setup

Requirements: Node.js 20.12+ (22 recommended) and npm 10+.

```bash
git clone https://github.com/Jolly-Panda-Works/mini-sumo-3d.git
cd mini-sumo-3d
npm install
npm run dev        # server on :2567, client on :5173
```

Open two browser tabs, create a private room in one and join with the invite link in the other.

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

## Guidelines

- **The server is authoritative.** Clients send only input (direction, dash, lobby actions). Never trust client positions, collisions, eliminations or winners. New gameplay logic belongs in `apps/server/src/simulation` or `apps/server/src/game` and should come with tests in `apps/server/test`.
- **Keep rendering cosmetic.** Effects, animation and camera code in `apps/client/src/game` must not influence gameplay.
- **Shared contracts** (message names, constants, synced state types) live in `packages/shared`. If you change them, update both client and server.
- **Style:** TypeScript strict mode, no disabled compiler checks, small focused modules. Follow the existing formatting (2 spaces, double quotes; see `.editorconfig`).
- **Assets:** only original work or assets with a license compatible with MIT. No copyrighted characters or third-party game art.
- **Commits:** use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`…), with a short summary and a body explaining *why*.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change with tests where it makes sense.
3. Update `README.md` and `CHANGELOG.md` (under *Unreleased*) if behaviour changes.
4. Open the pull request and fill in the template. CI must pass.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
