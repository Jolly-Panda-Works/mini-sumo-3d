// Turns the generated Android project into the Cafe Bazaar build:
// Poolakey (Bazaar in-app billing), CafeBazaarAuth (sign in with Bazaar + in-app storage),
// BazaarUpdater (in-app update), the login-check AIDL and the Bazaar plugin, Kotlin for the
// plugin, the RSA key as a string resource and the <queries> entry for the Bazaar app (Android 11+).
// Settings in bazaar.config.json; BAZAAR_RSA_KEY (env) overrides the key.
// Run after `cap add/sync android`. Don't combine with play-games.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const settings = JSON.parse(readFileSync(new URL("bazaar.config.json", root), "utf8"));
const rsaKey = (process.env.BAZAAR_RSA_KEY || settings.rsaKey || "").trim();
if (!/^[A-Za-z0-9+/=]{100,}$/.test(rsaKey)) {
  console.error("The Bazaar RSA key is missing or malformed (bazaar.config.json or BAZAAR_RSA_KEY).");
  process.exit(1);
}
if (!existsSync(new URL("android/app/build.gradle", root))) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(new URL("capacitor.config.json", root), "utf8"));
const pkg = config.appId;
const read = (path) => readFileSync(new URL(path, root), "utf8");
const write = (path, text) => writeFileSync(new URL(path, root), text);

// Plugin + MainActivity
const javaDir = `android/app/src/main/java/${pkg.replaceAll(".", "/")}/`;
mkdirSync(new URL(javaDir, root), { recursive: true });
write(`${javaDir}BazaarPlugin.kt`, read("native/BazaarPlugin.kt").replace("__PACKAGE__", pkg));
write(`${javaDir}MainActivity.java`, read("native/MainActivity.bazaar.java").replace("__PACKAGE__", pkg));

// Bazaar's login-check service interface
mkdirSync(new URL("android/app/src/main/aidl/com/farsitel/bazaar/", root), { recursive: true });
write("android/app/src/main/aidl/com/farsitel/bazaar/ILoginCheckService.aidl", read("native/ILoginCheckService.aidl"));

// Kotlin Gradle plugin + JitPack (Poolakey is published there)
let rootGradle = read("android/build.gradle");
if (!rootGradle.includes("kotlin-gradle-plugin")) {
  rootGradle = rootGradle.replace(
    /(buildscript\s*\{[\s\S]*?dependencies\s*\{)/,
    `$1\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:${settings.kotlinVersion}"`,
  );
}
if (!rootGradle.includes("jitpack.io")) {
  // After the standard repositories, so only Bazaar's libraries are looked up there.
  rootGradle = rootGradle.replace(
    /(allprojects\s*\{\s*repositories\s*\{[\s\S]*?)(\n\s*\})/,
    `$1\n        maven { url "https://jitpack.io"; content { includeGroupByRegex "com\\\\.github\\\\.cafebazaar.*" } }$2`,
  );
}
// CafeBazaarAuth brings androidx.core 1.17, which needs the Android Gradle plugin 8.9.1+ and
// compiling against API 36 (only the compile SDK; the target SDK, i.e. runtime behaviour, stays).
const versionKey = (v) => v.split(".").reduce((key, n) => key * 1000 + Number(n), 0);
rootGradle = rootGradle.replace(/(com\.android\.tools\.build:gradle:)(\d+\.\d+\.\d+)/, (m, pre, v) =>
  versionKey(v) < versionKey("8.9.1") ? `${pre}8.9.1` : m,
);
write("android/build.gradle", rootGradle);
let variables = read("android/variables.gradle");
variables = variables.replace(/(compileSdkVersion\s*=\s*)(\d+)/, (m, pre, v) => (Number(v) < 36 ? `${pre}36` : m));
write("android/variables.gradle", variables);

let appGradle = read("android/app/build.gradle");
if (!appGradle.includes("kotlin-android")) {
  appGradle = appGradle.replace(/apply plugin: ['"]com\.android\.application['"]/, (m) => `${m}\napply plugin: 'kotlin-android'`);
}
if (!appGradle.includes("cafebazaar.Poolakey")) {
  appGradle = appGradle.replace(
    /dependencies\s*\{/,
    (m) => `${m}\n    implementation "com.github.cafebazaar.Poolakey:poolakey:${settings.poolakeyVersion}"\n    implementation "org.jetbrains.kotlin:kotlin-stdlib:${settings.kotlinVersion}"`,
  );
}
if (!appGradle.includes("CafeBazaarAuth")) {
  appGradle = appGradle.replace(
    /dependencies\s*\{/,
    (m) =>
      `${m}\n    implementation "com.github.cafebazaar.CafeBazaarAuth:auth:${settings.authVersion}"\n    implementation "com.github.cafebazaar:bazaarUpdater:${settings.updaterVersion}"`,
  );
}
if (!/buildFeatures\s*\{[^}]*aidl/.test(appGradle)) {
  appGradle = appGradle.replace(/android\s*\{/, (m) => `${m}\n    buildFeatures { aidl true }`);
}
// Kotlin's JVM target (Kotlin 2.2: compilerOptions; the old kotlinOptions block is an error)
if (!appGradle.includes("JvmTarget.JVM_21")) {
  appGradle += `\nkotlin {\n    compilerOptions {\n        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)\n    }\n}\n`;
}
write("android/app/build.gradle", appGradle);

// Don't fail on a Java/Kotlin target mismatch from other modules.
let props = existsSync(new URL("android/gradle.properties", root)) ? read("android/gradle.properties") : "";
if (!props.includes("kotlin.jvm.target.validation.mode")) {
  props += "\nkotlin.jvm.target.validation.mode=warning\n";
  write("android/gradle.properties", props);
}

// RSA key resource
let strings = read("android/app/src/main/res/values/strings.xml");
if (!strings.includes("bazaar_rsa_key")) {
  strings = strings.replace("</resources>", `    <string name="bazaar_rsa_key" translatable="false">${rsaKey}</string>\n</resources>`);
  write("android/app/src/main/res/values/strings.xml", strings);
}

// Android 11+: let the app see the Bazaar client
let manifest = read("android/app/src/main/AndroidManifest.xml");
if (!manifest.includes("com.farsitel.bazaar")) {
  manifest = manifest.replace(
    /<application/,
    `<queries>\n        <package android:name="com.farsitel.bazaar" />\n    </queries>\n\n    <application`,
  );
  write("android/app/src/main/AndroidManifest.xml", manifest);
}

console.log(
  `Cafe Bazaar added (Poolakey ${settings.poolakeyVersion}, auth ${settings.authVersion}, updater ${settings.updaterVersion}, package ${pkg}).`,
);
