import type { EconomyFlags } from "@mini-sumo/shared";

/**
 * Payment integration boundary. No provider is selected, so nothing here can succeed.
 *
 * To add a provider later:
 * 1. Implement PaymentProvider (checkout creation and server-side receipt/webhook verification).
 * 2. Register it in createPaymentService().
 * 3. Fulfil verified orders with Economy.credit(...) using the idempotency key
 *    `payment:<provider>:<orderId>`, so retries and duplicate webhooks never double-grant.
 * 4. Enable the premiumCurrency / realMoneyPurchases flags only after legal and store review.
 */
export interface PaymentProvider {
  readonly id: string;
  createCheckout(accountId: string, productId: string): Promise<{ checkoutUrl: string; orderId: string }>;
  verifyOrder(orderId: string): Promise<{ status: "paid" | "pending" | "failed" | "refunded"; productId: string; accountId: string }>;
}

export type PaymentResult = { ok: false; error: "payments_disabled" | "no_provider"; message: string };

export class PaymentService {
  constructor(
    private readonly flags: EconomyFlags,
    private readonly provider: PaymentProvider | null = null,
  ) {}

  get available(): boolean {
    return false;
  }

  /** Always refuses: no provider is configured and real-money purchases are disabled. */
  async createCheckout(_accountId: string, _productId: unknown): Promise<PaymentResult> {
    if (!this.flags.realMoneyPurchases || !this.flags.premiumCurrency) {
      return { ok: false, error: "payments_disabled", message: "Purchases with real money are not available." };
    }
    if (!this.provider) {
      return { ok: false, error: "no_provider", message: "No payment provider is configured." };
    }
    // A provider exists only once one has been selected and implemented.
    return { ok: false, error: "no_provider", message: "No payment provider is configured." };
  }
}
