# Security Policy

## Supported versions

Only the [latest release](https://github.com/Jolly-Panda-Works/mini-sumo-3d/releases/latest) and the `main` branch receive security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub: **Security → Report a vulnerability** on this repository ([private vulnerability reporting](https://github.com/Jolly-Panda-Works/mini-sumo-3d/security/advisories/new)), or via the contact options on [useffarahmand.com](https://www.useffarahmand.com).

Include:

- what is affected (server, web client, desktop app, Android app, CI),
- steps to reproduce or a proof of concept,
- the impact you expect.

You'll get an acknowledgement within 7 days. Once a fix is released you'll be credited in the release notes unless you prefer to stay anonymous.

## Scope notes

- The game server is authoritative and treats every client message as untrusted. Ways to forge positions, eliminations, winners, host actions, or to crash or exhaust a server are in scope.
- Room codes control discoverability only; anyone with a code can join. That is by design, not a vulnerability.
- Desktop and Android builds are currently unsigned (see [CODE_SIGNING.md](CODE_SIGNING.md)).
