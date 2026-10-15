/**
 * Prize for a paid match, in integer coins.
 *   pool = entryFee * players
 *   prize = floor(pool * (100 - feePercent) / 100)
 *   sink = pool - prize          (removed from circulation; never more than the pool)
 * Integer arithmetic only: prize + sink === pool, nothing is created by rounding.
 */
export function computePrize(entryFee: number, players: number, feePercent: number): { pool: number; prize: number; sink: number } {
  if (!Number.isInteger(entryFee) || entryFee < 0 || !Number.isInteger(players) || players < 0) {
    throw new Error("invalid prize input");
  }
  const fee = Math.min(100, Math.max(0, Math.floor(feePercent)));
  const pool = entryFee * players;
  const prize = Math.floor((pool * (100 - fee)) / 100);
  return { pool, prize, sink: pool - prize };
}
