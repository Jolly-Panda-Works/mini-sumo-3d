// Adds Google Play Games Services (sign-in + Saved Games) to the generated Android project.
// Needs PLAY_GAMES_APP_ID (the numeric project id from Play Console > Play Games Services).
// Without it the app builds as before and the game shows Google Play as "Coming soon".
// Run after `cap add/sync android`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const appId = (process.env.PLAY_GAMES_APP_ID ?? "").trim();
if (!appId) {
  console.log("PLAY_GAMES_APP_ID not set: skipping Google Play Games.");
  process.exit(0);
}
if (!/^\d+$/.test(appId)) {
  console.error(`PLAY_GAMES_APP_ID must be the numeric project id, got "${appId}".`);
  process.exit(1);
}

const root = new URL("../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("capacitor.config.json", root), "utf8"));
const pkg = config.appId;
const javaDir = new URL(`android/app/src/main/java/${pkg.replaceAll(".", "/")}/`, root);
if (!existsSync(new URL("android/app/build.gradle", root))) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}
mkdirSync(javaDir, { recursive: true });

for (const file of ["PlayGamesPlugin.java", "MainActivity.java"]) {
  const source = readFileSync(new URL(`native/${file}`, root), "utf8").replace("__PACKAGE__", pkg);
  writeFileSync(new URL(file, javaDir), source);
}

// Dependency
const gradleUrl = new URL("android/app/build.gradle", root);
let gradle = readFileSync(gradleUrl, "utf8");
if (!gradle.includes("play-services-games-v2")) {
  gradle = gradle.replace(/dependencies\s*\{/, (m) => `${m}\n    implementation "com.google.android.gms:play-services-games-v2:20.1.2"`);
  writeFileSync(gradleUrl, gradle);
}

// Project id resource and manifest entry
const stringsUrl = new URL("android/app/src/main/res/values/strings.xml", root);
let strings = readFileSync(stringsUrl, "utf8");
if (!strings.includes("game_services_project_id")) {
  strings = strings.replace("</resources>", `    <string name="game_services_project_id" translatable="false">${appId}</string>\n</resources>`);
  writeFileSync(stringsUrl, strings);
}
const manifestUrl = new URL("android/app/src/main/AndroidManifest.xml", root);
let manifest = readFileSync(manifestUrl, "utf8");
if (!manifest.includes("com.google.android.gms.games.APP_ID")) {
  manifest = manifest.replace(
    /<application([^>]*)>/,
    (m) => `${m}\n        <meta-data android:name="com.google.android.gms.games.APP_ID" android:value="@string/game_services_project_id" />`,
  );
  writeFileSync(manifestUrl, manifest);
}
console.log(`Google Play Games added (project ${appId}, package ${pkg}).`);
