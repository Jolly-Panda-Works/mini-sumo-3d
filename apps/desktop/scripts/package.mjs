// Packages the desktop app with electron-builder from an isolated staging directory.
//
// Why staging: apps/desktop lives inside an npm workspace repository. electron-builder
// detects the repository root as a "workspace" and, on some platforms, collects the
// root project itself as a dependency (copying the whole repo into the app). The app has
// no runtime dependencies, so we build from a clean folder containing only main.cjs,
// the web client and icons.
//
// Usage: node scripts/package.mjs [--win|--mac|--linux] [extra electron-builder args]
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => {
  console.error(`[package] ${message}`);
  process.exit(1);
};
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const pkg = readJson(path.join(appDir, "package.json"));
const electronPkg = path.join(appDir, "node_modules", "electron", "package.json");
const builderCli = path.join(appDir, "node_modules", "electron-builder", "cli.js");
if (!existsSync(electronPkg) || !existsSync(builderCli)) {
  fail("Desktop dependencies are missing. Run: npm install --prefix apps/desktop");
}
if (!existsSync(path.join(appDir, "web", "index.html"))) {
  fail("apps/desktop/web is missing. Run: npm run prepare:web (after building the client).");
}
const electronVersion = readJson(electronPkg).version;

// GitHub repository for the publish/update metadata. CI provides GITHUB_REPOSITORY.
const repoField = typeof pkg.repository === "string" ? pkg.repository : (pkg.repository?.url ?? "");
const repoSlug = (process.env.GITHUB_REPOSITORY || repoField.replace(/^.*github\.com[/:]/, ""))
  .replace(/\.git$/, "")
  .replace(/\/+$/, "");
const [owner, repo] = repoSlug.split("/");
if (!owner || !repo) fail(`Cannot determine the GitHub repository (got "${repoSlug}"). Set "repository" in apps/desktop/package.json.`);

const build = {
  ...pkg.build,
  electronVersion,
  npmRebuild: false,
  directories: { output: path.join(appDir, "release"), buildResources: "build" },
  files: ["main.cjs", "web/**/*"],
  // Explicit publish target: without it electron-builder 26 crashes while writing
  // update metadata ("Cannot read properties of null (reading 'channel')").
  // Nothing is uploaded because we always pass --publish never.
  publish: [{ provider: "github", owner, repo, releaseType: "release" }],
};

const stagedPkg = {
  name: "mini-sumo-desktop",
  productName: pkg.productName,
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  homepage: `https://github.com/${owner}/${repo}`,
  repository: `https://github.com/${owner}/${repo}`,
  license: pkg.license ?? "UNLICENSED",
  desktopName: "mini-sumo.desktop",
  main: "main.cjs",
  build,
};

const stage = path.join(process.env.RUNNER_TEMP || tmpdir(), "mini-sumo-desktop-stage");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(path.join(appDir, "main.cjs"), path.join(stage, "main.cjs"));
cpSync(path.join(appDir, "web"), path.join(stage, "web"), { recursive: true });
cpSync(path.join(appDir, "build"), path.join(stage, "build"), { recursive: true });
writeFileSync(path.join(stage, "package.json"), JSON.stringify(stagedPkg, null, 2));

console.log(`[package] electron ${electronVersion}, repo ${owner}/${repo}, staging in ${stage}`);
const args = [builderCli, "--projectDir", stage, "--publish", "never", ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });

rmSync(stage, { recursive: true, force: true });
process.exit(result.status ?? 1);
