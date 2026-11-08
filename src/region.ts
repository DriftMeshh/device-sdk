const DEFAULT_CELL_SIZE_DEGREES = 0.1;

/**
 * Interleaves the low `bitsPerAxis` bits of `lonIndex` and `latIndex`
 * into a single unsigned integer, built **most-significant-bit first**:
 * for i from bitsPerAxis-1 down to 0, append lonIndex's bit i, then
 * latIndex's bit i, to the growing result (longitude always precedes
 * latitude at each pair). This is exactly the bit-interleaving ("Z-order"
 * / Morton encoding) step standard geohash uses before base32-encoding
 * the result — the same interleaving family geohash-int implementations
 * (e.g. Redis's `GEOADD`) use directly as an integer, without the
 * base32 step. Building MSB-first preserves geohash's prefix property:
 * truncating the *low* bits of the result still yields a valid
 * (lower-precision) cell containing the original point.
 *
 * `bitsPerAxis` must be at most 16, so the interleaved result fits in 32
 * bits (2 * 16).
 */
function interleaveBitsMsbFirst(lonIndex: number, latIndex: number, bitsPerAxis: number): number {
  let result = 0;
  for (let bit = bitsPerAxis - 1; bit >= 0; bit--) {
    result = (result << 1) | ((lonIndex >>> bit) & 1);
    result = (result << 1) | ((latIndex >>> bit) & 1);
  }
  // `>>> 0` reinterprets the bit pattern as an unsigned 32-bit integer —
  // without it, a result with its top bit set would come out as a
  // negative JS number from the `<<` shifts above, which doesn't encode
  // correctly as the contract's u32 region_code.
  return result >>> 0;
}

/**
 * Buckets a lat/lon into a coarse grid cell, matching the `region_code`
 * `submission-validator` groups readings by for outlier comparison.
 * Every device submitting for the same physical area needs to compute
 * the same code, so this is shared logic, not an implementation detail
 * left to each device integration to reinvent.
 *
 * A geohash-int-style encoding (see `interleaveBitsMsbFirst`): divides
 * the lat/lon range into `cellSizeDegrees`-sized grid cells exactly as
 * before, but instead of packing the two 16-bit grid indices into
 * un-interleaved halves of a u32 (this function's pre-geohash scheme —
 * see git history), their bits are now interleaved MSB-first,
 * longitude-then-latitude at each pair. A fresh deployment only:
 * `region_code` values computed under the old packed-halves scheme and
 * this one are **not compatible** — there's no way to reconcile
 * historical on-chain region averages between the two, so this must
 * ship alongside a fresh contracts redeploy, not against already-running
 * region averages.
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

  return interleaveBitsMsbFirst(lonIndex, latIndex, 16);
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
