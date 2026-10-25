import { describe, expect, it } from "vitest";
import { versionInfo } from "../src/http/version.js";

describe("update check", () => {
  it("reports the game's version, overridable, and an optional minimum", () => {
    expect(versionInfo({ CLIENT_LATEST_VERSION: "2.0.0", CLIENT_MIN_VERSION: "1.9.0" })).toEqual({ latest: "2.0.0", min: "1.9.0" });
    const info = versionInfo({});
    expect(info.min).toBe("");
    expect(typeof info.latest).toBe("string");
  });
});
