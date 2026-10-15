/**
 * Resolve the Colyseus endpoint.
 * - VITE_SERVER_URL wins (set it for production, e.g. wss://sumo.example.com).
 * - Otherwise use the page's own hostname on VITE_SERVER_PORT (default 2567). This makes
 *   local development and LAN testing from a phone work without configuration.
 */
export function resolveServerUrl(): string {
  const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const port = (import.meta.env.VITE_SERVER_PORT as string | undefined)?.trim() || "2567";
  if (import.meta.env.PROD) {
    console.warn("[mini-sumo] VITE_SERVER_URL is not set; falling back to the page host on port " + port);
  }
  return `${protocol}://${window.location.hostname}:${port}`;
}
