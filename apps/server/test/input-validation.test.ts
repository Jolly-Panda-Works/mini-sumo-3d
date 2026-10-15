import { describe, expect, it } from "vitest";
import { sanitizeIsPrivate, sanitizeMaxPlayers, sanitizeName, validateMoveInput } from "../src/validation/InputValidator.js";

describe("input validation", () => {
  it("accepts valid input", () => {
    expect(validateMoveInput({ x: 0.5, y: -0.5 })).toEqual({ x: 0.5, y: -0.5 });
  });

  it("rejects malformed payloads", () => {
    for (const bad of [null, undefined, 3, "up", [], [1, 0], {}, { x: "1", y: 0 }, { x: 1 }, { x: Number.NaN, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }]) {
      expect(validateMoveInput(bad)).toBeNull();
    }
  });

  it("clamps and normalizes out-of-range input", () => {
    const v = validateMoveInput({ x: 100, y: 100 })!;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    expect(v.x).toBeCloseTo(v.y, 9);
  });

  it("applies a small deadzone", () => {
    expect(validateMoveInput({ x: 0.01, y: -0.01 })).toEqual({ x: 0, y: 0 });
  });

  it("sanitizes names", () => {
    expect(sanitizeName("  Kenta  ", "x")).toBe("Kenta");
    expect(sanitizeName("a\u0000b\u202Ec", "x")).toBe("abc");
    expect(sanitizeName("", "Sumo 1")).toBe("Sumo 1");
    expect(sanitizeName(42, "Sumo 1")).toBe("Sumo 1");
    expect(Array.from(sanitizeName("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "x"))).toHaveLength(16);
    expect(sanitizeName("سارا", "x")).toBe("سارا");
  });

  it("sanitizes room options", () => {
    expect(sanitizeMaxPlayers(3)).toBe(3);
    expect(sanitizeMaxPlayers(1)).toBe(2);
    expect(sanitizeMaxPlayers(99)).toBe(4);
    expect(sanitizeMaxPlayers("4")).toBe(4);
    expect(sanitizeMaxPlayers(2.5)).toBe(4);
    expect(sanitizeIsPrivate(true)).toBe(true);
    expect(sanitizeIsPrivate("true")).toBe(false);
  });
});
