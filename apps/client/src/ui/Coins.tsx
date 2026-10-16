import { Icon } from "./Icon";

/** Coin amount with an icon. Screen readers also hear "Sumo Coins". */
export function Coins({ amount, signed = false }: { amount: number; signed?: boolean }) {
  const text = `${signed && amount > 0 ? "+" : ""}${amount.toLocaleString("en-US")}`;
  return (
    <span className="coins">
      <Icon name="coin" size={20} className="coins__img" />
      {text}
      <span className="visually-hidden"> Sumo Coins</span>
    </span>
  );
}
