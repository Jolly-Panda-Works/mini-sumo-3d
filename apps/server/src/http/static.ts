import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

/**
 * Serves the built web game (apps/client/dist) from the game server itself, so one container
 * and one port carry the page, the API, matchmaking and the game websockets.
 * Enabled when STATIC_DIR points at the build. Unknown paths fall back to index.html.
 */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary",
};

export function createStaticHandler(dir: string | undefined) {
  if (!dir) return async () => false;
  const root = resolve(dir);
  const index = join(root, "index.html");

  const fileAt = (urlPath: string): string | null => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    const full = resolve(root, "." + normalize("/" + decoded));
    if (full !== root && !full.startsWith(root + sep)) return null; // no path traversal
    try {
      const stat = statSync(full);
      if (stat.isFile()) return full;
      if (stat.isDirectory()) {
        const nested = join(full, "index.html");
        return statSync(nested).isFile() ? nested : null;
      }
    } catch {
      // not found
    }
    return null;
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    const urlPath = (req.url ?? "/").split("?")[0]!;
    if (urlPath.startsWith("/matchmake") || urlPath.startsWith("/api/") || urlPath === "/health") return false;

    let file = fileAt(urlPath);
    // Single-page app: paths without a file extension get the page.
    if (!file && !extname(urlPath)) file = index;
    if (!file) return false;

    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      return false;
    }
    const isPage = file.endsWith(".html");
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": size,
      // Built files have hashed names; the page is always revalidated so updates show up.
      "Cache-Control": isPage ? "no-cache" : urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
    return true;
  };
}
