# Running Mini Sumo with Docker

One container (`web`): the Node game server also serves the built web game, so the page,
the economy API (`/api`), matchmaking (`/matchmake`), `/health` and the game websockets all
share one port (80 inside the container, 5803 outside by default). The database (SQLite) is
in the `mini-sumo-data` volume. The web game is built with `VITE_SERVER_URL=same-origin`, so it
finds the server on the same address as the page.

```bash
cp .env.docker.example .env   # optional
docker compose up -d --build
# open http://<server-ip>:5803
```

Logs: `docker compose logs -f web`. Update: `git pull && docker compose up -d --build`.
The database survives rebuilds (volume `mini-sumo-data`); back it up with
`docker compose cp web:/data/mini-sumo.db ./backup.db`.

## Building in Iran

- **Base images:** Docker Hub refuses Iranian IPs, so images are pulled through a mirror
  (`REGISTRY`, default `docker.arvancloud.ir`). If it's down, try `focker.ir`,
  `docker.iranserver.com` or `hub.hamdocker.ir`, or configure a mirror in the Docker daemon
  (`/etc/docker/daemon.json`: `{"registry-mirrors": ["https://docker.arvancloud.ir"]}`) and
  set `REGISTRY=docker.io`.
- **npm:** `NPM_REGISTRY` (default `https://registry.npmjs.org/`) can point to a mirror; npm
  retries slow downloads for up to 3 minutes per package.
- **Proxy:** `HTTP_PROXY` / `HTTPS_PROXY` in `.env` are used during the build only.
- **No system packages:** nothing is installed with `apk`, so no Alpine mirror is needed.
- At runtime the containers need no internet access at all.

## HTTPS

Put the container behind your HTTPS proxy (Caddy, nginx, Arvan CDN…) and forward
websockets (`Upgrade` / `Connection` headers). The game switches to `wss://` automatically on
an `https://` page.

## The Android app and this server

The Android app is built by GitHub Actions. To make it use this server, set the repository
variable `VITE_SERVER_URL` to `wss://your-domain` (or `ws://ip:5803` for testing).
