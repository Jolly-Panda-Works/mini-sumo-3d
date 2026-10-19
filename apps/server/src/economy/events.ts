/**
 * Provider-independent economy events for balancing (arena entries, prizes, refunds,
 * purchases). The default sink writes one JSON line per event; swap it for an analytics
 * pipeline later. No personal data beyond the random guest account id.
 */
export type EconomyEventName =
  | "account_created"
  | "arena_entry_accepted"
  | "arena_entry_rejected"
  | "arena_entry_refunded"
  | "match_started"
  | "match_settled"
  | "match_cancelled"
  | "rewards_granted"
  | "cosmetic_purchased"
  | "cosmetic_purchase_rejected"
  | "payment_rejected"
  | "daily_gift"
  | "coins_purchased";

export type EconomyEventSink = (name: EconomyEventName, data: Record<string, unknown>) => void;

export const consoleEventSink: EconomyEventSink = (name, data) => {
  if (process.env.ECONOMY_EVENT_LOG === "false") return;
  console.info(JSON.stringify({ ts: new Date().toISOString(), event: name, ...data }));
};

export const silentEventSink: EconomyEventSink = () => undefined;
