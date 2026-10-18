import { Icon } from "./Icon";

/**
 * Short coin amounts for tight spots: 950, 1k, 1.2k, 12k, 1.5M (one decimal, dropped when
 * it's .0).
 */
export function compactCoins(amount: number): string {
  const n = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const short = (value: number, unit: string) => `${sign}${(Math.floor(value * 10) / 10).toFixed(1).replace(/\.0$/, "")}${unit}`;
  if (n >= 1_000_000) return short(n / 1_000_000, "M");
  if (n >= 1_000) return short(n / 1_000, "k");
  return `${sign}${n}`;
}

/** Coin amount with an icon. Screen readers also hear the exact amount and "Sumo Coins". */
export function Coins({ amount, signed = false, compact = false }: { amount: number; signed?: boolean; compact?: boolean }) {
  const text = `${signed && amount > 0 ? "+" : ""}${compact ? compactCoins(amount) : amount.toLocaleString("en-US")}`;
  return (
    <span className="coins" aria-label={compact ? `${amount.toLocaleString("en-US")} Sumo Coins` : undefined}>
      <Icon name="coin" size={20} className="coins__img" />
      {text}
      <span className="visually-hidden"> Sumo Coins</span>
    </span>
  );
}
