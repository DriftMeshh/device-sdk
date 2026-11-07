import { describe, expect, it } from "vitest";
import { regionCodeFromLatLon, regionCodeMismatchWarning } from "../src/region.js";

describe("regionCodeFromLatLon", () => {
  it("is deterministic for the same coordinates", () => {
    const a = regionCodeFromLatLon(40.7128, -73.969);
    const b = regionCodeFromLatLon(40.7128, -73.969);
    expect(a).toBe(b);
  });

  it("groups nearby coordinates into the same cell", () => {
    const a = regionCodeFromLatLon(40.71, -73.96, 0.1);
    const b = regionCodeFromLatLon(40.74, -73.93, 0.1); // same 0.1° cell
    expect(a).toBe(b);
  });

  it("separates coordinates in different cells", () => {
    const a = regionCodeFromLatLon(40.7, -73.9, 0.1);
    const b = regionCodeFromLatLon(41.2, -73.9, 0.1);
    expect(a).not.toBe(b);
  });

  it("returns a non-negative u32-safe integer even near the poles/date line", () => {
    const code = regionCodeFromLatLon(89.9, 179.9, 0.1);
    expect(code).toBeGreaterThanOrEqual(0);
    expect(code).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(code)).toBe(true);
  });

  it("rejects out-of-range latitude", () => {
    expect(() => regionCodeFromLatLon(91, 0)).toThrow(RangeError);
    expect(() => regionCodeFromLatLon(-91, 0)).toThrow(RangeError);
  });

  it("rejects out-of-range longitude", () => {
    expect(() => regionCodeFromLatLon(0, 181)).toThrow(RangeError);
    expect(() => regionCodeFromLatLon(0, -181)).toThrow(RangeError);
  });

  it("rejects a non-positive cell size", () => {
    expect(() => regionCodeFromLatLon(0, 0, 0)).toThrow(RangeError);
    expect(() => regionCodeFromLatLon(0, 0, -1)).toThrow(RangeError);
  });

  it("rejects a cell size so small the index would overflow 16 bits", () => {
    expect(() => regionCodeFromLatLon(89, 179, 0.0001)).toThrow(RangeError);
  });
});

describe("regionCodeMismatchWarning", () => {
  it("returns null when configured and registered locations are in the same cell", () => {
    expect(regionCodeMismatchWarning(40.71, -73.96, 40.74, -73.93, 0.1)).toBeNull();
  });

  it("returns null for the exact same coordinates", () => {
    expect(regionCodeMismatchWarning(40.7128, -73.969, 40.7128, -73.969)).toBeNull();
  });

  it("returns a warning message when the two are in different cells", () => {
    const warning = regionCodeMismatchWarning(40.7, -73.9, 41.2, -73.9, 0.1);
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/doesn't match/);
  });

  it("includes the registered lat/lon in the warning for operator debugging", () => {
    const warning = regionCodeMismatchWarning(40.7, -73.9, 41.2, -75.5, 0.1);
    expect(warning).toContain("41.2");
    expect(warning).toContain("-75.5");
  });

  it("respects a custom cell size", () => {
    // Far enough apart to differ at 0.1° cells, but the same cell at 10°.
    expect(regionCodeMismatchWarning(40.1, -73.1, 40.9, -73.9, 10)).toBeNull();
    expect(regionCodeMismatchWarning(40.1, -73.1, 40.9, -73.9, 0.1)).not.toBeNull();
  });
});
