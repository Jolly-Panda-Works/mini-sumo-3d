import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The game's version for update checks: the root package.json (the release process bumps it,
 * and the server is built from the same commit as each release), unless CLIENT_LATEST_VERSION
 * overrides it. CLIENT_MIN_VERSION (optional): older apps must update before they can play.
 */
export interface VersionInfo {
  latest: string;
  min: string;
}

function rootVersion(): string {
  for (const dir of [process.cwd(), join(process.cwd(), ".."), join(process.cwd(), "../..")]) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.name === "mini-sumo" && pkg.version) return pkg.version;
    } catch {
      // not here
    }
  }
  return "";
}

export function versionInfo(env: Record<string, string | undefined> = process.env): VersionInfo {
  return {
    latest: env.CLIENT_LATEST_VERSION?.trim() || rootVersion(),
    min: env.CLIENT_MIN_VERSION?.trim() || "",
  };
}
