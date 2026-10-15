import type { Economy } from "./Economy.js";

/** Process-wide economy service (null when ECONOMY_ENABLED=false). Set once at startup. */
let instance: Economy | null = null;

export function setEconomy(economy: Economy | null): void {
  instance = economy;
}

export function getEconomy(): Economy | null {
  return instance;
}
