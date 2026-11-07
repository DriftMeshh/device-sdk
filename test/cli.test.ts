import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("defaults to no flags set", () => {
    expect(parseCliArgs([])).toEqual({ once: false, diagnoseEpoch: false, epochOverride: undefined });
  });

  it("detects --once", () => {
    expect(parseCliArgs(["--once"]).once).toBe(true);
  });

  it("detects --diagnose-epoch", () => {
    expect(parseCliArgs(["--diagnose-epoch"]).diagnoseEpoch).toBe(true);
  });

  it("parses a valid --epoch value", () => {
    expect(parseCliArgs(["--epoch", "42"]).epochOverride).toBe(42);
  });

  it("allows --epoch 0", () => {
    expect(parseCliArgs(["--epoch", "0"]).epochOverride).toBe(0);
  });

  it("combines flags", () => {
    expect(parseCliArgs(["--once", "--epoch", "7"])).toEqual({
      once: true,
      diagnoseEpoch: false,
      epochOverride: 7,
    });
  });

  it("rejects a missing --epoch value", () => {
    expect(() => parseCliArgs(["--epoch"])).toThrow(/non-negative integer/);
  });

  it("rejects a non-numeric --epoch value", () => {
    expect(() => parseCliArgs(["--epoch", "abc"])).toThrow(/non-negative integer/);
  });

  it("rejects a negative --epoch value", () => {
    expect(() => parseCliArgs(["--epoch", "-1"])).toThrow(/non-negative integer/);
  });

  it("rejects a fractional --epoch value", () => {
    expect(() => parseCliArgs(["--epoch", "1.5"])).toThrow(/non-negative integer/);
  });
});
