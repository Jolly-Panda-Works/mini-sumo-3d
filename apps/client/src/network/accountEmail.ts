import { request, switchAccount } from "./economyClient";

/**
 * Signing in with an email (server: apps/server/src/account/Recovery.ts).
 *
 * One flow: the player enters an email and gets a 6-digit code.
 * - A new email ("link"): the code saves this player with it.
 * - An email that already saves a player ("restore"): the code signs this device in as that
 *   player, and the game restarts with their wrestler, coins and items.
 * Signing out: this device's key stops working and it starts as a new guest; the email signs
 * back in any time.
 */
export type SignInPurpose = "link" | "restore";

const lang = (): "en" | "fa" => (navigator.language?.toLowerCase().startsWith("fa") ? "fa" : "en");

export const linkedEmail = () => request<{ email: string | null; available: boolean }>("/account/email");

/** Emails the code; says whether it saves this player or signs in to an existing one. */
export async function sendSignInCode(email: string): Promise<SignInPurpose> {
  const result = await request<{ purpose?: SignInPurpose }>("/account/email/start", {
    method: "POST",
    body: JSON.stringify({ email, lang: lang() }),
  });
  return result.purpose ?? "link";
}

/** Checks the code. "restore" switches this device to that player (the game restarts). */
export async function confirmSignInCode(purpose: SignInPurpose, email: string, code: string): Promise<string> {
  if (purpose === "link") {
    const result = await request<{ email: string }>("/account/email/verify", { method: "POST", body: JSON.stringify({ email, code }) });
    return result.email;
  }
  const account = await request<{ accountId: string; token: string }>(
    "/account/restore/verify",
    { method: "POST", body: JSON.stringify({ email, code }) },
    false,
  );
  switchAccount(account);
  return email;
}

/** Signs this device out (the game restarts as a new guest). */
export async function signOut(): Promise<void> {
  try {
    await request("/account/logout", { method: "POST" });
  } catch {
    // Offline: the key is forgotten on this device anyway.
  }
  switchAccount(null);
}

/** A code from the email's link (?code=…&email=…&purpose=…), taken once and removed from the address. */
export function codeFromLink(): { code: string; email: string; purpose: SignInPurpose } | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const email = url.searchParams.get("email");
  const purpose = url.searchParams.get("purpose");
  if (!code || !email || (purpose !== "link" && purpose !== "restore")) return null;
  for (const key of ["code", "email", "purpose"]) url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
  return { code, email, purpose };
}
