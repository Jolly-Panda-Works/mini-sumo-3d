// Locks the Android app to landscape (either way round). Run after `cap add/sync android`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url);
if (!existsSync(file)) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}
let xml = readFileSync(file, "utf8");
if (/android:screenOrientation="[^"]*"/.test(xml)) {
  xml = xml.replace(/android:screenOrientation="[^"]*"/g, 'android:screenOrientation="sensorLandscape"');
} else {
  xml = xml.replace(/<activity(\s)/, '<activity android:screenOrientation="sensorLandscape"$1');
}
writeFileSync(file, xml);
console.log("Android activity locked to sensorLandscape");
