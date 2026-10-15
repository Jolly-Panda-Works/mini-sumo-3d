// Writes the arena card art used in the README: npx tsx tools/arena-art.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { ARENA_THEMES, arenaArtSvg } from "../apps/client/src/game/arenaThemes";

mkdirSync("docs/arenas", { recursive: true });
for (const id of Object.keys(ARENA_THEMES)) {
  writeFileSync(`docs/arenas/${id}.svg`, arenaArtSvg(id, 640, 360));
  console.log(`docs/arenas/${id}.svg`);
}
