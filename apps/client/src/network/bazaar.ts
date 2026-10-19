import { BAZAAR_PRODUCTS, packForBazaarProduct, type BazaarPurchaseRequest, type BazaarPurchaseResponse, type CoinPack } from "@mini-sumo/shared";
import { economyStore, refreshProfile, request } from "./economyClient";
import { localEconomy } from "./localEconomy";
import { networkStore } from "./networkMode";

/**
 * Cafe Bazaar in-app billing (the Bazaar build only: VITE_STORE=bazaar plus the native
 * Bazaar plugin).
 *
 * Online, the purchase token goes to the game server, which checks it with Cafe Bazaar and
 * credits the coins to your account once; only then is the purchase consumed in Bazaar (so
 * it can be bought again). If anything fails in between, the purchase stays unconsumed and
 * is sent again the next time the shop opens: nothing paid is lost.
 * Offline, the coins go to the wallet on this device, as before.
 */
interface Purchase {
  orderId: string;
  purchaseToken: string;
  productId: string;
}

interface BazaarNative {
  connect(): Promise<void>;
  purchase(options: { productId: string; payload?: string }): Promise<Purchase>;
  consume(options: { purchaseToken: string }): Promise<void>;
  purchases(): Promise<{ purchases: Purchase[] }>;
}

export type BuyResult = "bought" | "cancelled";

function native(): BazaarNative | null {
  const cap = (window as unknown as { Capacitor?: { isPluginAvailable?(name: string): boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isPluginAvailable?.("Bazaar")) return null;
  return (cap.Plugins?.Bazaar as BazaarNative | undefined) ?? null;
}

/** True in the Cafe Bazaar build on a device. */
export const bazaarEnabled = (): boolean => import.meta.env.VITE_STORE === "bazaar" && native() !== null;

/**
 * Coin packs can be bought right now: the Bazaar build on a device, and either offline (the
 * coins go to this device) or online with a server that can verify Bazaar purchases.
 */
export function bazaarBuyable(): boolean {
  if (!bazaarEnabled()) return false;
  if (networkStore.get().mode !== "online") return true;
  return Boolean(economyStore.get().catalog?.stores?.bazaar);
}


let connecting: Promise<void> | null = null;
async function connect(): Promise<BazaarNative> {
  const plugin = native();
  if (!plugin) throw new Error("Buying coins needs the Cafe Bazaar version of the game.");
  connecting ??= plugin.connect().catch((error: unknown) => {
    connecting = null;
    throw new Error(
      error instanceof Error && error.message ? error.message : "Couldn't reach Cafe Bazaar. Check that Bazaar is installed and you're signed in.",
    );
  });
  await connecting;
  return plugin;
}

/** Credits (once) and consumes a paid purchase. */
/** Credits one paid purchase (server online, device offline), then consumes it. */
async function finish(plugin: BazaarNative, purchase: Purchase): Promise<boolean> {
  const pack = packForBazaarProduct(purchase.productId);
  if (!pack) return false;
  let credited: boolean;
  if (networkStore.get().mode === "online") {
    // Throws when the server can't confirm it yet: the purchase then stays unconsumed.
    const result = await request<BazaarPurchaseResponse>("/purchases/bazaar", {
      method: "POST",
      body: JSON.stringify({ productId: purchase.productId, purchaseToken: purchase.purchaseToken } satisfies BazaarPurchaseRequest),
    });
    credited = result.credited;
  } else {
    credited = localEconomy.creditCoinPurchase(purchase.purchaseToken, pack.coins, pack.name);
  }
  try {
    await plugin.consume({ purchaseToken: purchase.purchaseToken });
  } catch {
    // Credited already; consuming is retried on the next restore (crediting is once per token).
  }
  if (credited) await refreshProfile();
  return credited;
}

export async function buyCoinPack(pack: CoinPack): Promise<BuyResult> {
  const productId = BAZAAR_PRODUCTS[pack.id];
  if (!productId) throw new Error("This pack isn't sold in Cafe Bazaar.");
  const plugin = await connect();
  let purchase: Purchase;
  try {
    purchase = await plugin.purchase({ productId, payload: pack.id });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "CANCELLED") return "cancelled";
    throw error instanceof Error ? error : new Error("The purchase failed.");
  }
  await finish(plugin, purchase);
  return "bought";
}

/** Finishes purchases that were paid but not credited/consumed. Returns the coins credited. */
export async function restoreBazaarPurchases(): Promise<number> {
  if (!bazaarEnabled()) return 0;
  try {
    const plugin = await connect();
    const { purchases } = await plugin.purchases();
    let coins = 0;
    for (const purchase of purchases) {
      try {
        if (await finish(plugin, purchase)) coins += packForBazaarProduct(purchase.productId)?.coins ?? 0;
      } catch {
        // This one couldn't be confirmed yet: it stays unconsumed and is tried again later.
      }
    }
    return coins;
  } catch {
    return 0;
  }
}
