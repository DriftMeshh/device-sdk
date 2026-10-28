const DEFAULT_CELL_SIZE_DEGREES = 0.1;

/**
 * Buckets a lat/lon into a coarse grid cell, matching the `region_code`
 * `submission-validator` groups readings by for outlier comparison.
 * Every device submitting for the same physical area needs to compute
 * the same code, so this is shared logic, not an implementation detail
 * left to each device integration to reinvent.
 *
 * Packs a 16-bit latitude index and a 16-bit longitude index into one
 * u32 (lat in the high bits, lon in the low bits) — simple and good
 * enough for a demo; a real geohash would pack more precision per bit
 * and support variable cell sizes per query, left as a Wave issue.
 */
export function regionCodeFromLatLon(
  latDegrees: number,
  lonDegrees: number,
  cellSizeDegrees: number = DEFAULT_CELL_SIZE_DEGREES,
): number {
  if (latDegrees < -90 || latDegrees > 90) {
    throw new RangeError(`lat out of range [-90, 90]: ${latDegrees}`);
  }
  if (lonDegrees < -180 || lonDegrees > 180) {
    throw new RangeError(`lon out of range [-180, 180]: ${lonDegrees}`);
  }
  if (!(cellSizeDegrees > 0)) {
    throw new RangeError(`cellSizeDegrees must be positive: ${cellSizeDegrees}`);
  }

  const latIndex = Math.floor((latDegrees + 90) / cellSizeDegrees);
  const lonIndex = Math.floor((lonDegrees + 180) / cellSizeDegrees);

  if (latIndex > 0xffff || lonIndex > 0xffff) {
    throw new RangeError(
      `cellSizeDegrees=${cellSizeDegrees} is too small: region index would exceed 16 bits`,
    );
  }

  // `>>> 0` reinterprets the bit pattern as an unsigned 32-bit integer —
  // without it, a latIndex >= 0x8000 would flip the sign bit and this
  // would come out as a negative JS number, which doesn't encode
  // correctly as the contract's u32 region_code.
  return (((latIndex & 0xffff) << 16) | (lonIndex & 0xffff)) >>> 0;
}
