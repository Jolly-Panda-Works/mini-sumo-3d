import { COIN_PACKS, type CoinPack } from "@mini-sumo/shared";
import { refreshProfile } from "./economyClient";
import { localEconomy } from "./localEconomy";
import { BAZAAR_PRODUCTS } from "./bazaarProducts";

/**
 * Cafe Bazaar in-app billing (the Bazaar build only: VITE_STORE=bazaar plus the native
 * Bazaar plugin). A coin pack is bought, credited to the on-device wallet once per purchase
 * token, then consumed so it can be bought again. Purchases that were paid but not finished
 * (the app closed in between) are credited the next time the shop connects.
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

const packForProduct = (productId: string): CoinPack | undefined =>
  COIN_PACKS.find((pack) => BAZAAR_PRODUCTS[pack.id] === productId);

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
async function finish(plugin: BazaarNative, purchase: Purchase): Promise<boolean> {
  const pack = packForProduct(purchase.productId);
  if (!pack) return false;
  const credited = localEconomy.creditCoinPurchase(purchase.purchaseToken, pack.coins, pack.name);
  try {
    await plugin.consume({ purchaseToken: purchase.purchaseToken });
  } catch {
    // Credited already; consuming is retried on the next restore.
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
      if (await finish(plugin, purchase)) coins += packForProduct(purchase.productId)?.coins ?? 0;
    }
    return coins;
  } catch {
    return 0;
  }
}
