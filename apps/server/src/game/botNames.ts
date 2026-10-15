/** Ordinary player-style names for computer-controlled wrestlers. */
export const BOT_NAMES = [
  "Kenta", "Hiro", "Mika", "Sora", "Yuki", "Taro", "Aiko", "Ren",
  "Leo", "Nina", "Omid", "Sara", "Arash", "Maya", "Luca", "Emma",
  "Kai", "Noah", "Lina", "Dara", "Milo", "Zara", "Theo", "Ava",
  "Babak", "Neda", "Kaveh", "Shirin", "Jonas", "Elif", "Mateo", "Ines",
] as const;

/** Mulberry32: small deterministic PRNG so bot behaviour is reproducible in tests. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Id shaped like a Colyseus session id, so bots are not recognisable by their key. */
export function randomId(rng: () => number, length = 9): string {
  let id = "";
  for (let i = 0; i < length; i++) id += ID_CHARS[Math.floor(rng() * ID_CHARS.length)];
  return id;
}

/** Picks a random name not already used in the room (case-insensitive). */
export function pickBotName(taken: Iterable<string>, rng: () => number): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const free = BOT_NAMES.filter((n) => !used.has(n.toLowerCase()));
  if (free.length > 0) return free[Math.floor(rng() * free.length)]!;
  return `${BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)]} ${2 + Math.floor(rng() * 8)}`;
}
