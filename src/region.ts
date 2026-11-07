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

/**
 * Compares the region code the configured LAT/LON would submit under
 * against the region code the device's on-chain registered location
 * implies. They can drift apart silently: `ensureRegistered` only
 * registers once and skips re-registration while already active, so if
 * LAT/LON env vars change after that first registration, readings keep
 * submitting under a *different* region_code than the one implied by the
 * on-chain record — with no error, since `submit_reading` doesn't
 * validate `region_code` against the registry at all.
 *
 * Returns a human-readable warning message when the two disagree, or
 * `null` when they match. Pure/deterministic so it's unit-testable
 * without a live registry read — see `DriftMeshDevice.fetchRegisteredLocation`
 * for where the registered lat/lon actually comes from.
 */
export function regionCodeMismatchWarning(
  configuredLat: number,
  configuredLon: number,
  registeredLat: number,
  registeredLon: number,
  cellSizeDegrees: number = DEFAULT_CELL_SIZE_DEGREES,
): string | null {
  const configuredCode = regionCodeFromLatLon(configuredLat, configuredLon, cellSizeDegrees);
  const registeredCode = regionCodeFromLatLon(registeredLat, registeredLon, cellSizeDegrees);
  if (configuredCode === registeredCode) return null;

  return (
    `configured LAT/LON (region_code=${configuredCode}) doesn't match the device's ` +
    `registered location (lat=${registeredLat}, lon=${registeredLon}, region_code=${registeredCode}). ` +
    `Readings will keep submitting under the configured region_code, not the registered one. ` +
    `Fix LAT/LON to match registration, or re-register the device, if this drift is unintentional.`
  );
}
