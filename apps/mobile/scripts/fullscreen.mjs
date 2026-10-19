// Full screen in every build: writes the plain MainActivity (status bar hidden). Run right after
// `cap add/sync android`, before play-games.mjs / bazaar.mjs, which replace it with their own
// MainActivity (also full screen) when they apply.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("capacitor.config.json", root), "utf8"));
const pkg = config.appId;
if (!existsSync(new URL("android/app/build.gradle", root))) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}
const javaDir = new URL(`android/app/src/main/java/${pkg.replaceAll(".", "/")}/`, root);
mkdirSync(javaDir, { recursive: true });
const source = readFileSync(new URL("native/MainActivity.plain.java", root), "utf8").replace("__PACKAGE__", pkg);
writeFileSync(new URL("MainActivity.java", javaDir), source);
console.log(`Full screen: MainActivity written for ${pkg}.`);
