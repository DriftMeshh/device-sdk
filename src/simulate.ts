/**
 * Generates plausible fixed-point sensor readings via a small random walk,
 * standing in for real hardware until `device-sdk` is pointed at an actual
 * sensor. Values are fixed-point integers (e.g. temperature * 100, matching
 * how `submission-validator` treats `value`), never floats — Soroban has no
 * floating-point type.
 */
export class ReadingSimulator {
  private current: number;

  constructor(
    private readonly baseline = 2000, // 20.00 °C * 100
    private readonly stepSize = 50, // max ±0.50°C change per tick
    private readonly min = -4000, // -40.00 °C
    private readonly max = 5000, // 50.00 °C
  ) {
    this.current = baseline;
  }

  next(): number {
    const delta = Math.round((Math.random() * 2 - 1) * this.stepSize);
    this.current = Math.min(this.max, Math.max(this.min, this.current + delta));
    return this.current;
  }
}

/**
 * Buckets the current time into a reward epoch, relative to `epochZero` —
 * `submission-validator`'s own deployment timestamp (`EpochZero`, set at
 * `initialize()`), not absolute Unix time. Epoch numbering restarts from 0
 * on every fresh deployment, so this must be fetched from the contract
 * itself (see `DriftMeshDevice.fetchEpochZero`) rather than assumed —
 * using Unix-epoch-relative numbering here would compute an epoch number
 * the contract's `compute_epoch_end` could never consider final, since
 * its own formula is `epoch_zero + (epoch + 1) * epoch_seconds`.
 */
export function currentEpoch(
  epochSeconds: number,
  epochZero: number,
  nowMs: number = Date.now(),
): number {
  if (!(epochSeconds > 0)) {
    throw new RangeError(`epochSeconds must be positive: ${epochSeconds}`);
  }
  return Math.floor((nowMs / 1000 - epochZero) / epochSeconds);
}
