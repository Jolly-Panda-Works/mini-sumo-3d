// Locks the Android app to portrait. Run after `cap add/sync android`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ORIENTATION = "portrait";
const file = new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url);
if (!existsSync(file)) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}
let xml = readFileSync(file, "utf8");
if (/android:screenOrientation="[^"]*"/.test(xml)) {
  xml = xml.replace(/android:screenOrientation="[^"]*"/g, `android:screenOrientation="${ORIENTATION}"`);
} else {
  xml = xml.replace(/<activity(\s)/, `<activity android:screenOrientation="${ORIENTATION}"$1`);
}
writeFileSync(file, xml);
console.log(`Android activity locked to ${ORIENTATION}`);
