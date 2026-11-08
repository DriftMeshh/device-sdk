import { describe, expect, it } from "vitest";
import { parseCliArgs, type RunArgs } from "../src/cli.js";

describe("parseCliArgs — run mode (default)", () => {
  it("defaults to no flags set", () => {
    expect(parseCliArgs([])).toEqual({
      command: "run",
      once: false,
      diagnoseEpoch: false,
      epochOverride: undefined,
    });
  });

  it("detects --once", () => {
    expect((parseCliArgs(["--once"]) as RunArgs).once).toBe(true);
  });

  it("detects --diagnose-epoch", () => {
    expect((parseCliArgs(["--diagnose-epoch"]) as RunArgs).diagnoseEpoch).toBe(true);
  });

  it("parses a valid --epoch value", () => {
    expect((parseCliArgs(["--epoch", "42"]) as RunArgs).epochOverride).toBe(42);
  });

  it("allows --epoch 0", () => {
    expect((parseCliArgs(["--epoch", "0"]) as RunArgs).epochOverride).toBe(0);
  });

  it("combines flags", () => {
    expect(parseCliArgs(["--once", "--epoch", "7"])).toEqual({
      command: "run",
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

describe("parseCliArgs — claim command", () => {
  it("parses a bare claim command with no epoch", () => {
    expect(parseCliArgs(["claim"])).toEqual({ command: "claim", epoch: undefined });
  });

  it("parses claim --epoch <n>", () => {
    expect(parseCliArgs(["claim", "--epoch", "5"])).toEqual({ command: "claim", epoch: 5 });
  });

  it("allows claim --epoch 0", () => {
    expect(parseCliArgs(["claim", "--epoch", "0"])).toEqual({ command: "claim", epoch: 0 });
  });

  it("rejects an invalid --epoch value under claim the same way run mode does", () => {
    expect(() => parseCliArgs(["claim", "--epoch", "abc"])).toThrow(/non-negative integer/);
    expect(() => parseCliArgs(["claim", "--epoch", "-1"])).toThrow(/non-negative integer/);
  });

  it("only treats a leading 'claim' as the command, not one appearing later", () => {
    const result = parseCliArgs(["--once", "claim"]);
    expect(result.command).toBe("run");
  });
});

describe("parseCliArgs — deactivate command", () => {
  it("parses a bare deactivate command", () => {
    expect(parseCliArgs(["deactivate"])).toEqual({ command: "deactivate" });
  });

  it("ignores trailing arguments after deactivate", () => {
    expect(parseCliArgs(["deactivate", "--whatever"])).toEqual({ command: "deactivate" });
  });

  it("only treats a leading 'deactivate' as the command, not one appearing later", () => {
    const result = parseCliArgs(["--once", "deactivate"]);
    expect(result.command).toBe("run");
  });
});
