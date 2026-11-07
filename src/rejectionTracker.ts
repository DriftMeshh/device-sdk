/**
 * Tracks consecutive reading rejections across `tick()` calls so a
 * miscalibrated sensor producing a run of out-of-range values gets called
 * out distinctly, instead of blending into the per-reading log line that
 * a casually-watching operator could easily miss one of among many.
 *
 * Fires exactly once per streak, the moment it *crosses* the threshold —
 * not on every subsequent tick while still above it — to surface the
 * pattern without spamming the log for a sensor that just keeps failing.
 * Any accepted reading resets the streak, so a later renewed run of
 * rejections fires the warning again.
 */
export class RejectionStreakTracker {
  private consecutiveRejections = 0;

  constructor(private readonly threshold: number) {
    if (!(threshold > 0)) {
      throw new RangeError(`threshold must be positive: ${threshold}`);
    }
  }

  get streak(): number {
    return this.consecutiveRejections;
  }

  /** Records one reading's outcome. Returns true exactly when the streak
   * just reached `threshold` (the crossing tick), false otherwise. */
  record(accepted: boolean): boolean {
    if (accepted) {
      this.consecutiveRejections = 0;
      return false;
    }
    this.consecutiveRejections++;
    return this.consecutiveRejections === this.threshold;
  }
}
