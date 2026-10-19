import { adoptAccount, request } from "./economyClient";

/**
 * Saving progress with an email (server: apps/server/src/account/Recovery.ts).
 * Link: a code is emailed; entering it saves this account with the email.
 * Restore: on another device, a code is emailed; entering it brings that account here.
 */
const lang = (): "en" | "fa" => (navigator.language?.toLowerCase().startsWith("fa") ? "fa" : "en");

export const linkedEmail = () => request<{ email: string | null; available: boolean }>("/account/email");

export const sendLinkCode = (email: string) =>
  request("/account/email/start", { method: "POST", body: JSON.stringify({ email, lang: lang() }) });

export const confirmLinkCode = (email: string, code: string) =>
  request<{ email: string }>("/account/email/verify", { method: "POST", body: JSON.stringify({ email, code }) });

export const sendRestoreCode = (email: string) =>
  request("/account/restore/start", { method: "POST", body: JSON.stringify({ email, lang: lang() }) }, false);

/** Brings the account saved with this email to this device (the game restarts). */
export async function confirmRestoreCode(email: string, code: string): Promise<void> {
  const account = await request<{ accountId: string; token: string }>(
    "/account/restore/verify",
    { method: "POST", body: JSON.stringify({ email, code }) },
    false,
  );
  adoptAccount(account);
}

/** A code from the email's link (?code=…&email=…&purpose=…), taken once and removed from the address. */
export function codeFromLink(): { code: string; email: string; purpose: "link" | "restore" } | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const email = url.searchParams.get("email");
  const purpose = url.searchParams.get("purpose");
  if (!code || !email || (purpose !== "link" && purpose !== "restore")) return null;
  for (const key of ["code", "email", "purpose"]) url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
  return { code, email, purpose };
}
