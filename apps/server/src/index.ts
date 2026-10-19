import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CREDITS, ROOM_NAME } from "@mini-sumo/shared";
import { MiniSumoRoom } from "./rooms/MiniSumoRoom.js";
import { loadFlags } from "./economy/config.js";
import { Economy, EconomyError } from "./economy/Economy.js";
import { setEconomy } from "./economy/instance.js";
import { PaymentService } from "./economy/payments.js";
import { createApiHandler } from "./http/api.js";
import { Friends } from "./social/Friends.js";
import { BazaarVerifier, bazaarConfigFromEnv } from "./economy/bazaar.js";
import { createStaticHandler } from "./http/static.js";

// Load the repository-level .env (if present) without extra dependencies (Node >= 20.12).
const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const port = Number.parseInt(process.env.PORT ?? "2567", 10) || 2567;
const host = process.env.HOST || "0.0.0.0";

// Economy: SQLite file (DATABASE_PATH), guest accounts, wallet, ledger, arenas, shop.
const flags = loadFlags();
const economy = flags.economy ? new Economy(process.env.DATABASE_PATH || "data/mini-sumo.db", flags) : null;
setEconomy(economy);
if (economy) {
  const refunded = economy.recoverOrphanedEntries();
  if (refunded > 0) console.log(`[mini-sumo] refunded ${refunded} arena entries left over from the last run`);
}
// Friends (and inviting bot friends into rooms).
const friends = economy ? new Friends(economy) : null;
if (friends) {
  friends.onBotInvite = (botAccountId, roomId) => {
    const room = MiniSumoRoom.live.get(roomId);
    if (!room) throw new EconomyError("unknown_friend", "That room is closed.");
    room.addFriendBot(botAccountId);
  };
}
// Cafe Bazaar purchases: on when its keys are set (tools/server-bazaar-setup.sh)
const bazaarConfig = bazaarConfigFromEnv();
const bazaar = bazaarConfig ? new BazaarVerifier(bazaarConfig) : null;
console.log(bazaar ? `[bazaar] purchase verification on (${bazaarConfig!.packageName})` : "[bazaar] purchase verification off (no keys)");
const handleApi = createApiHandler(economy, new PaymentService(flags), friends, bazaar);
// The built web game, when this server also hosts it (STATIC_DIR, set in the Docker image).
const handleStatic = createStaticHandler(process.env.STATIC_DIR);

// Plain HTTP handler for non-matchmaking routes. Colyseus attaches /matchmake/* itself.
const httpServer = createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  if (req.url === "/health" || (req.url === "/" && !process.env.STATIC_DIR)) {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true, game: "mini-sumo", economy: flags.economy, author: CREDITS.author, website: CREDITS.projectUrl }));
    return;
  }
  if (await handleStatic(req, res)) return;
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Matchmaking groups rooms by arena (and bot difficulty for training), so players only meet
// rooms of the arena and difficulty they picked.
gameServer.define(ROOM_NAME, MiniSumoRoom).filterBy(["arenaId", "botLevel"]);

await gameServer.listen(port, host);
console.log(`[mini-sumo] Mini Sumo by ${CREDITS.author} (${CREDITS.projectUrl})`);
console.log(`[mini-sumo] Colyseus server listening on ws://${host}:${port} (health: http://${host}:${port}/health)`);
