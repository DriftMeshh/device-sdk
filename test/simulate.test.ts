import { describe, expect, it } from "vitest";
import { ReadingSimulator, currentEpoch } from "../src/simulate.js";

describe("ReadingSimulator", () => {
  it("stays within [min, max] over many ticks", () => {
    const sim = new ReadingSimulator(2000, 50, -4000, 5000);
    for (let i = 0; i < 1000; i++) {
      const value = sim.next();
      expect(value).toBeGreaterThanOrEqual(-4000);
      expect(value).toBeLessThanOrEqual(5000);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("never moves more than stepSize in one tick", () => {
    const sim = new ReadingSimulator(2000, 50, -4000, 5000);
    let previous = 2000;
    for (let i = 0; i < 200; i++) {
      const value = sim.next();
      expect(Math.abs(value - previous)).toBeLessThanOrEqual(50);
      previous = value;
    }
  });

  it("clamps at the configured bounds instead of exceeding them", () => {
    // baseline already at max, so every upward step should clamp, not overflow.
    const sim = new ReadingSimulator(5000, 50, -4000, 5000);
    for (let i = 0; i < 50; i++) {
      expect(sim.next()).toBeLessThanOrEqual(5000);
    }
  });
});

describe("currentEpoch", () => {
  it("buckets timestamps into the same epoch within one window", () => {
    const epochSeconds = 3600;
    const epochZero = 1_800_000_000;
    const start = 1_800_000_000_000; // ms
    const a = currentEpoch(epochSeconds, epochZero, start);
    const b = currentEpoch(epochSeconds, epochZero, start + 1000 * 60 * 30); // +30 min
    expect(a).toBe(b);
  });

  it("advances to the next epoch once the window elapses", () => {
    const epochSeconds = 3600;
    const epochZero = 1_800_000_000;
    const start = 1_800_000_000_000;
    const a = currentEpoch(epochSeconds, epochZero, start);
    const b = currentEpoch(epochSeconds, epochZero, start + epochSeconds * 1000);
    expect(b).toBe(a + 1);
  });

  it("is relative to epochZero, not absolute Unix time", () => {
    // Same instant, two different contract deployment times (epochZero) —
    // this is exactly the bug fixed here: epoch numbers aren't portable
    // across deployments, so the same wall-clock moment must bucket
    // differently once epochZero differs.
    const epochSeconds = 3600;
    const nowMs = 1_800_000_000_000;
    const freshlyDeployed = currentEpoch(epochSeconds, 1_799_999_000, nowMs);
    const deployedLongAgo = currentEpoch(epochSeconds, 0, nowMs);
    expect(freshlyDeployed).not.toBe(deployedLongAgo);
    expect(freshlyDeployed).toBe(0);
  });

  it("rejects a non-positive epoch window", () => {
    expect(() => currentEpoch(0, 0)).toThrow(RangeError);
    expect(() => currentEpoch(-10, 0)).toThrow(RangeError);
  });
});
