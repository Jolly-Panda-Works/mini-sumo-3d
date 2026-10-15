import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@mini-sumo/shared";
import { MiniSumoRoom } from "./rooms/MiniSumoRoom.js";

// Load the repository-level .env (if present) without extra dependencies (Node >= 20.12).
const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const port = Number.parseInt(process.env.PORT ?? "2567", 10) || 2567;
const host = process.env.HOST || "0.0.0.0";

// Plain HTTP handler for non-matchmaking routes. Colyseus attaches /matchmake/* itself.
const httpServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true, game: "mini-sumo" }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, MiniSumoRoom);

await gameServer.listen(port, host);
console.log(`[mini-sumo] Colyseus server listening on ws://${host}:${port} (health: http://${host}:${port}/health)`);
