#!/usr/bin/env bash
# Sign in with Cafe Bazaar on the web: server side.
#
# Run on the server, in the project folder (next to docker-compose.yml):
#   bash tools/server-bazaar-login-setup.sh
#
# It asks for the client id and secret from the Bazaar panel (the app -> "ورود با بازار"),
# writes them into this folder's .env (readable only by you) and restarts the game. In the
# panel, add the callback address it prints to the allowed redirect addresses.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ ! -f docker-compose.yml ]; then
  echo "ERROR: run this from the project folder (docker-compose.yml not found)." >&2
  exit 1
fi

say() { printf '\n\033[33m== %s\033[0m\n' "$1"; }
ok() { printf '\033[32m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
current() { [ -f .env ] && grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }

say "1/3  The values (Bazaar panel -> the app -> ورود با بازار)"
read -r -p "BAZAAR_LOGIN_CLIENT_ID [$(current BAZAAR_LOGIN_CLIENT_ID)]: " CLIENT_ID
CLIENT_ID="${CLIENT_ID:-$(current BAZAAR_LOGIN_CLIENT_ID)}"
read -r -s -p "BAZAAR_LOGIN_SECRET (hidden; Enter keeps the current one): " SECRET; echo
SECRET="${SECRET:-$(current BAZAAR_LOGIN_SECRET)}"
if [ -z "$CLIENT_ID" ] || [ -z "$SECRET" ]; then echo "ERROR: both values are needed." >&2; exit 1; fi

say "2/3  Writing .env"
touch .env
set_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  grep -v -E "^$key=" .env > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}
set_value BAZAAR_LOGIN_CLIENT_ID "$CLIENT_ID"
set_value BAZAAR_LOGIN_SECRET "$SECRET"
chmod 600 .env
ok "Saved (.env is readable only by you)."

say "3/3  Restarting the game"
docker compose up -d --build
PUBLIC="$(current PUBLIC_URL)"; PUBLIC="${PUBLIC:-https://sumo.ryujin.fans/}"
echo
ok "Done. In the Bazaar panel (ورود با بازار), allow this redirect address:"
echo "  ${PUBLIC%/}/api/account/bazaar/callback"
