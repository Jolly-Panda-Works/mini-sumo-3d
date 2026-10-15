// Copies the built web client (apps/client/dist) into the Electron app (apps/desktop/web).
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../client/dist/", import.meta.url));
const target = fileURLToPath(new URL("../web/", import.meta.url));

if (!existsSync(source)) {
  console.error("apps/client/dist is missing. Build the client first: npm run build:web");
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied web client to ${target}`);
