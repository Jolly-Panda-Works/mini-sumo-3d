#!/usr/bin/env bash
# Cafe Bazaar purchase validation: server side.
#
# Run on the server, in the project folder (next to docker-compose.yml):
#   bash tools/server-bazaar-setup.sh
#
# It asks for the four BAZAAR_* values (from the .env that tools\bazaar-api-setup.cmd wrote on
# your PC), writes them into this folder's .env (readable only by you), checks that this
# server can reach Cafe Bazaar with them, and restarts the game.
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

say "1/4  The values (from the .env on your PC)"
read -r -p "BAZAAR_CLIENT_ID [$(current BAZAAR_CLIENT_ID)]: " CLIENT_ID
CLIENT_ID="${CLIENT_ID:-$(current BAZAAR_CLIENT_ID)}"
read -r -s -p "BAZAAR_CLIENT_SECRET (hidden; Enter keeps the current one): " CLIENT_SECRET; echo
CLIENT_SECRET="${CLIENT_SECRET:-$(current BAZAAR_CLIENT_SECRET)}"
read -r -s -p "BAZAAR_REFRESH_TOKEN (hidden; Enter keeps the current one): " REFRESH_TOKEN; echo
REFRESH_TOKEN="${REFRESH_TOKEN:-$(current BAZAAR_REFRESH_TOKEN)}"
DEFAULT_PKG="$(current BAZAAR_PACKAGE_NAME)"; DEFAULT_PKG="${DEFAULT_PKG:-com.jollypanda.mini_sumo}"
read -r -p "BAZAAR_PACKAGE_NAME [$DEFAULT_PKG]: " PACKAGE_NAME
PACKAGE_NAME="${PACKAGE_NAME:-$DEFAULT_PKG}"

for pair in "BAZAAR_CLIENT_ID:$CLIENT_ID" "BAZAAR_CLIENT_SECRET:$CLIENT_SECRET" "BAZAAR_REFRESH_TOKEN:$REFRESH_TOKEN"; do
  if [ -z "${pair#*:}" ]; then echo "ERROR: ${pair%%:*} is empty." >&2; exit 1; fi
done

say "2/4  Checking that this server can reach Cafe Bazaar"
RESPONSE="$(curl -sS --max-time 20 -X POST https://pardakht.cafebazaar.ir/devapi/v2/auth/token/ \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode "refresh_token=$REFRESH_TOKEN" || true)"
if printf '%s' "$RESPONSE" | grep -q '"access_token"'; then
  ok "OK: Cafe Bazaar accepted the values from this server."
elif [ -z "$RESPONSE" ]; then
  warn "Warning: no answer from pardakht.cafebazaar.ir. This server may not reach Cafe Bazaar"
  warn "(firewall, DNS or the network). Purchases can't be checked until it can."
  read -r -p "Save the values anyway? [y/N] " yes; [ "${yes,,}" = "y" ] || exit 1
else
  warn "Cafe Bazaar refused the values: $RESPONSE"
  warn "Run tools\\bazaar-api-setup.cmd on your PC again for a new refresh token."
  read -r -p "Save the values anyway? [y/N] " yes; [ "${yes,,}" = "y" ] || exit 1
fi

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
set_value BAZAAR_CLIENT_ID "$CLIENT_ID"
set_value BAZAAR_CLIENT_SECRET "$CLIENT_SECRET"
set_value BAZAAR_REFRESH_TOKEN "$REFRESH_TOKEN"
set_value BAZAAR_PACKAGE_NAME "$PACKAGE_NAME"
chmod 600 .env
ok "Saved (.env is readable only by you)."

say "4/4  Restarting the game"
docker compose up -d --build
# The container sees the values (only whether they're set; secrets aren't printed)
for key in BAZAAR_CLIENT_ID BAZAAR_CLIENT_SECRET BAZAAR_REFRESH_TOKEN BAZAAR_PACKAGE_NAME; do
  if docker compose exec -T web sh -c "[ -n \"\$$key\" ]"; then ok "  $key: set in the container"; else warn "  $key: NOT set in the container"; fi
done
PORT="$(current WEB_PORT)"; PORT="${PORT:-6803}"
sleep 3
if curl -fsS --max-time 10 "http://127.0.0.1:$PORT/health" > /dev/null; then ok "The game server is up (port $PORT)."; else warn "The game server didn't answer on port $PORT yet: check 'docker compose logs -f web'."; fi

echo
ok "Done."
