/**
 * Cafe Bazaar purchase verification (Developer API, OAuth 2.0).
 *
 * The server keeps a refresh token (from tools/bazaar-api-setup.cmd) and trades it for a
 * short-lived access token when needed. A purchase is only credited when Cafe Bazaar confirms
 * it: bought (purchaseState 0) and not consumed yet (consumptionState 1). Configured through
 * BAZAAR_CLIENT_ID, BAZAAR_CLIENT_SECRET, BAZAAR_REFRESH_TOKEN and BAZAAR_PACKAGE_NAME.
 */
const API = "https://pardakht.cafebazaar.ir/devapi/v2";

export interface BazaarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  packageName: string;
}

export type BazaarCheck =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_purchased" | "consumed" | "unavailable"; detail?: string };

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export function bazaarConfigFromEnv(env: Record<string, string | undefined> = process.env): BazaarConfig | null {
  const clientId = env.BAZAAR_CLIENT_ID?.trim();
  const clientSecret = env.BAZAAR_CLIENT_SECRET?.trim();
  const refreshToken = env.BAZAAR_REFRESH_TOKEN?.trim();
  const packageName = env.BAZAAR_PACKAGE_NAME?.trim() || "com.jollypanda.mini_sumo";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, packageName };
}

export class BazaarVerifier {
  private accessToken = "";
  private expiresAt = 0;

  constructor(
    private readonly config: BazaarConfig,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** A valid access token (refreshed a minute before it runs out). */
  private async token(force = false): Promise<string> {
    if (!force && this.accessToken && this.now() < this.expiresAt - 60_000) return this.accessToken;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
    }).toString();
    const res = await this.fetchImpl(`${API}/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Cafe Bazaar refused the refresh token (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Cafe Bazaar sent no access token.");
    this.accessToken = data.access_token;
    this.expiresAt = this.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  /** Checks one purchase with Cafe Bazaar. */
  async check(productId: string, purchaseToken: string): Promise<BazaarCheck> {
    const url = `${API}/api/validate/${encodeURIComponent(this.config.packageName)}/inapp/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(purchaseToken)}/`;
    let res;
    try {
      res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${await this.token()}` } });
      // An access token can be revoked early: refresh once and try again.
      if (res.status === 401) res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${await this.token(true)}` } });
    } catch (error) {
      return { ok: false, reason: "unavailable", detail: error instanceof Error ? error.message : String(error) };
    }
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable", detail: `HTTP ${res.status}: ${await res.text()}` };
    const data = (await res.json()) as { purchaseState?: number; consumptionState?: number };
    if (data.purchaseState !== 0) return { ok: false, reason: "not_purchased" };
    if (data.consumptionState !== 1) return { ok: false, reason: "consumed" };
    return { ok: true };
  }
}
