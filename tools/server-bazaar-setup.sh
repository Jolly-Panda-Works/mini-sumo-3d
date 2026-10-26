#!/usr/bin/env bash
# Cafe Bazaar purchase validation: server side.
#
# Run on the server, in the project folder (next to docker-compose.yml):
#   bash tools/server-bazaar-setup.sh
#
# It asks for the app's Pishkhan API token (Bazaar panel -> the app -> "API پیشخان بازار" ->
# "دریافت توکن جدید"; the same token as the BAZAAR_PISHKHAN_TOKEN secret on GitHub), writes it
# into this folder's .env (readable only by you), checks that this server can reach Cafe Bazaar
# with it, and restarts the game.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ ! -f docker-compose.yml ]; then
  echo "ERROR: run this from the project folder (docker-compose.yml not found)." >&2
  exit 1
fi

say() { printf '\n\033[33m== %s\033[0m\n' "$1"; }
ok() { printf '\033[32m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }

# Current values (if any), so you can keep them by pressing Enter
current() { [ -f .env ] && grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }

say "1/4  The token (Bazaar panel -> the app -> API پیشخان بازار)"
read -r -s -p "BAZAAR_PISHKHAN_TOKEN (hidden; Enter keeps the current one): " TOKEN; echo
TOKEN="${TOKEN:-$(current BAZAAR_PISHKHAN_TOKEN)}"
if [ -z "$TOKEN" ]; then echo "ERROR: the token is empty." >&2; exit 1; fi
DEFAULT_PKG="$(current BAZAAR_PACKAGE_NAME)"; DEFAULT_PKG="${DEFAULT_PKG:-com.jollypanda.mini_sumo}"
read -r -p "BAZAAR_PACKAGE_NAME [$DEFAULT_PKG]: " PACKAGE_NAME
PACKAGE_NAME="${PACKAGE_NAME:-$DEFAULT_PKG}"

say "2/4  Checking that this server can reach Cafe Bazaar with it"
# A made-up purchase: "not found" (404) means Bazaar accepted the token; 401 / 403 means it didn't.
STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
  -H "CAFEBAZAAR-PISHKHAN-API-SECRET: $TOKEN" \
  "https://pardakht.cafebazaar.ir/devapi/v2/api/validate/$PACKAGE_NAME/inapp/coins_500/purchases/setup-check/" || true)"
case "$STATUS" in
  404 | 200) ok "OK: Cafe Bazaar accepted the token from this server." ;;
  401 | 403)
    warn "Cafe Bazaar refused the token (HTTP $STATUS). Make a new one in the panel (API پیشخان بازار)."
    read -r -p "Save it anyway? [y/N] " yes; [ "${yes,,}" = "y" ] || exit 1 ;;
  000 | "")
    warn "No answer from pardakht.cafebazaar.ir. This server may not reach Cafe Bazaar"
    warn "(firewall, DNS or the network). Purchases can't be checked until it can."
    read -r -p "Save it anyway? [y/N] " yes; [ "${yes,,}" = "y" ] || exit 1 ;;
  *)
    warn "Unexpected answer from Cafe Bazaar (HTTP $STATUS)."
    read -r -p "Save it anyway? [y/N] " yes; [ "${yes,,}" = "y" ] || exit 1 ;;
esac

say "3/4  Writing .env"
touch .env
set_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  grep -v -E "^$key=" .env > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}
set_value BAZAAR_PISHKHAN_TOKEN "$TOKEN"
set_value BAZAAR_PACKAGE_NAME "$PACKAGE_NAME"
chmod 600 .env
ok "Saved (.env is readable only by you)."

say "4/4  Restarting the game"
docker compose up -d --build
PORT="$(current WEB_PORT)"; PORT="${PORT:-6803}"
sleep 3
if curl -fsS --max-time 10 "http://127.0.0.1:$PORT/health" > /dev/null; then ok "The game server is up (port $PORT)."; else warn "The game server didn't answer on port $PORT yet: check 'docker compose logs -f web'."; fi
if docker compose logs web 2>/dev/null | grep -q "\[bazaar\] purchase verification on"; then
  ok "The game checks Cafe Bazaar purchases."
else
  warn "The log doesn't show '[bazaar] purchase verification on' yet: check 'docker compose logs web'."
fi

echo
ok "Done."
