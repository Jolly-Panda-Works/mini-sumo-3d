import { createStore } from "../store";

/**
 * online:   use the Colyseus server.
 * offline:  every room runs locally against bots (no server needed).
 * checking: deciding which one (auto mode, probing the server).
 */
export type NetworkMode = "checking" | "online" | "offline";

export const networkStore = createStore<{ mode: NetworkMode }>({ mode: "checking" });

/** ws(s)://host -> http(s)://host */
export function httpUrlFor(serverUrl: string): string {
  return serverUrl.replace(/^ws(s?):\/\//i, "http$1://");
}

/**
 * VITE_NETWORK_MODE = online | offline | auto (default).
 * auto: a production build without VITE_SERVER_URL is offline; otherwise the server's
 * /health endpoint is probed and the game goes offline if it doesn't answer.
 */
export async function detectNetworkMode(serverUrl: string): Promise<NetworkMode> {
  const configured = String(import.meta.env.VITE_NETWORK_MODE ?? "auto").trim().toLowerCase();
  if (configured === "offline") return "offline";
  if (configured === "online") return "online";
  const hasServerUrl = Boolean((import.meta.env.VITE_SERVER_URL as string | undefined)?.trim());
  if (import.meta.env.PROD && !hasServerUrl) return "offline";
  return (await probeServer(serverUrl)) ? "online" : "offline";
}

/** False when this build can never use a server (offline-only, or no server address). */
export function serverConfigured(): boolean {
  const configured = String(import.meta.env.VITE_NETWORK_MODE ?? "auto").trim().toLowerCase();
  if (configured === "offline") return false;
  const hasServerUrl = Boolean((import.meta.env.VITE_SERVER_URL as string | undefined)?.trim());
  return !(import.meta.env.PROD && !hasServerUrl);
}

export async function probeServer(serverUrl: string, timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${httpUrlFor(serverUrl)}/health`, { signal: controller.signal, cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}
