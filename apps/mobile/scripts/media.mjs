// Media build: a separate app ("Mini Sumo Media", its own package) so it installs next to the
// store version. Run before `cap add android`. The web part is built with VITE_MEDIA=1.
import { readFileSync, writeFileSync } from "node:fs";

const url = new URL("../capacitor.config.json", import.meta.url);
const config = JSON.parse(readFileSync(url, "utf8"));
config.appId = "com.jollypanda.mini_sumo.media";
config.appName = "Mini Sumo Media";
writeFileSync(url, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Media build: ${config.appName} (${config.appId}).`);
