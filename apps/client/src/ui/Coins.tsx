/** Coin amount with an icon. Always shows the word too, so it isn't conveyed by the icon alone. */
export function Coins({ amount, signed = false }: { amount: number; signed?: boolean }) {
  const text = `${signed && amount > 0 ? "+" : ""}${amount.toLocaleString("en-US")}`;
  return (
    <span className="coins">
      <span className="coins__icon" aria-hidden="true" />
      {text}
      <span className="visually-hidden"> Sumo Coins</span>
    </span>
  );
}
