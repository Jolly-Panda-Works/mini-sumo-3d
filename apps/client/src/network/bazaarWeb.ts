import { request, switchAccount } from "./economyClient";

/**
 * Sign in with Cafe Bazaar in the browser (server: apps/server/src/account/BazaarLogin.ts).
 *
 * The game asks the server for Bazaar's sign-in address and goes there; Bazaar sends the player
 * back through the server, which links their Bazaar account to this player (or, when it already
 * saves another player, prepares a key to that player) and returns to the game with a one-time
 * ticket (?bazaarLogin=…). The game claims the ticket: "linked", or "restore" (the game restarts
 * as that player). The Bazaar app build signs in through the Bazaar app instead (bazaarApp.ts).
 */
const isNativeApp = (): boolean =>
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
const isDesktopApp = (): boolean => /Electron\//.test(navigator.userAgent);

/** The web game in a browser (the Android and desktop apps can't come back from Bazaar's page). */
export const bazaarWebPossible = (): boolean => !isNativeApp() && !isDesktopApp() && import.meta.env.VITE_STORE !== "bazaar";

export const bazaarWebLinked = () => request<{ linked: boolean }>("/account/bazaar");

/** Goes to Bazaar's sign-in page; the player comes back to this page. */
export async function startBazaarWebLogin(): Promise<void> {
  const here = new URL(window.location.href);
  here.hash = "";
  const { url } = await request<{ url: string }>("/account/bazaar/start", { method: "POST", body: JSON.stringify({ returnUrl: here.toString() }) });
  window.location.assign(url);
}

/** The ticket from Bazaar's way back (?bazaarLogin=…), taken once and removed from the address. */
export function bazaarTicketFromLink(): string | null {
  const url = new URL(window.location.href);
  const ticket = url.searchParams.get("bazaarLogin");
  if (!ticket) return null;
  url.searchParams.delete("bazaarLogin");
  window.history.replaceState(null, "", url);
  return ticket;
}

/** Finishes a sign-in: "restore" switches this device to that player (the game restarts). */
export async function finishBazaarWebLogin(ticket: string): Promise<"linked" | "restore" | "cancelled" | "failed"> {
  if (ticket === "cancelled" || ticket === "failed") return ticket;
  const result = await request<{ outcome: "linked" | "restore"; accountId: string; token?: string }>(
    "/account/bazaar/claim",
    { method: "POST", body: JSON.stringify({ ticket }) },
    false,
  );
  if (result.outcome === "restore" && result.token) switchAccount({ accountId: result.accountId, token: result.token });
  return result.outcome;
}
