import { describe, expect, it } from "vitest";
import { RejectionStreakTracker } from "../src/rejectionTracker.js";

describe("RejectionStreakTracker", () => {
  it("rejects a non-positive threshold", () => {
    expect(() => new RejectionStreakTracker(0)).toThrow(RangeError);
    expect(() => new RejectionStreakTracker(-1)).toThrow(RangeError);
  });

  it("does not fire for accepted readings", () => {
    const tracker = new RejectionStreakTracker(3);
    expect(tracker.record(true)).toBe(false);
    expect(tracker.record(true)).toBe(false);
    expect(tracker.streak).toBe(0);
  });

  it("does not fire until the streak reaches the threshold", () => {
    const tracker = new RejectionStreakTracker(3);
    expect(tracker.record(false)).toBe(false);
    expect(tracker.record(false)).toBe(false);
    expect(tracker.streak).toBe(2);
  });

  it("fires exactly on the tick the streak crosses the threshold", () => {
    const tracker = new RejectionStreakTracker(3);
    tracker.record(false);
    tracker.record(false);
    expect(tracker.record(false)).toBe(true);
    expect(tracker.streak).toBe(3);
  });

  it("does not fire again on subsequent ticks past the threshold", () => {
    const tracker = new RejectionStreakTracker(3);
    tracker.record(false);
    tracker.record(false);
    tracker.record(false); // crosses here
    expect(tracker.record(false)).toBe(false);
    expect(tracker.record(false)).toBe(false);
    expect(tracker.streak).toBe(5);
  });

  it("resets the streak on an accepted reading", () => {
    const tracker = new RejectionStreakTracker(3);
    tracker.record(false);
    tracker.record(false);
    tracker.record(true);
    expect(tracker.streak).toBe(0);
  });

  it("fires again on a fresh streak after a reset", () => {
    const tracker = new RejectionStreakTracker(2);
    expect(tracker.record(false)).toBe(false);
    expect(tracker.record(false)).toBe(true); // first streak crosses
    tracker.record(true); // reset
    expect(tracker.record(false)).toBe(false);
    expect(tracker.record(false)).toBe(true); // second streak crosses again
  });

  it("supports a threshold of 1 (fires on the very first rejection)", () => {
    const tracker = new RejectionStreakTracker(1);
    expect(tracker.record(false)).toBe(true);
  });
});
