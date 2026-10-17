import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createStaticHandler } from "../src/http/static.js";

async function serve(dir: string) {
  const handle = createStaticHandler(dir);
  const server = createServer(async (req, res) => {
    if (await handle(req, res)) return;
    res.writeHead(404);
    res.end("nope");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((done) => server.close(() => done())) };
}

function site() {
  const dir = mkdtempSync(join(tmpdir(), "mini-sumo-static-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Mini Sumo</title>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app-123.js"), "console.log(1)");
  return dir;
}

describe("static web game", () => {
  it("serves the page, assets and falls back to the page for app routes", async () => {
    const { base, close } = await serve(site());
    try {
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect((page.headers.get("content-type") ?? "").includes("text/html")).toBe(true);
      const asset = await fetch(`${base}/assets/app-123.js`);
      expect((asset.headers.get("cache-control") ?? "").includes("immutable")).toBe(true);
      expect((await fetch(`${base}/some/route`)).status).toBe(200);
      expect((await fetch(`${base}/missing.png`)).status).toBe(404);
    } finally {
      await close();
    }
  });

  it("leaves the API, matchmaking and health to the server, and blocks path traversal", async () => {
    const { base, close } = await serve(site());
    try {
      expect((await fetch(`${base}/api/profile`)).status).toBe(404);
      expect((await fetch(`${base}/matchmake/joinOrCreate/sumo`)).status).toBe(404);
      expect((await fetch(`${base}/health`)).status).toBe(404);
      const traversal = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
      expect((await traversal.text()).includes("root:")).toBe(false);
    } finally {
      await close();
    }
  });
});
