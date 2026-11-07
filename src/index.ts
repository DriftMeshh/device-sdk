import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "./config.js";
import { DriftMeshDevice, ensureTrustline } from "./client.js";
import { regionCodeFromLatLon, regionCodeMismatchWarning } from "./region.js";
import { ReadingSimulator, currentEpoch } from "./simulate.js";
import { resolveDeviceSecret } from "./identity.js";
import { parseCliArgs } from "./cli.js";
import { getCachedEpochZero, setCachedEpochZero } from "./epochCache.js";
import { createLogger } from "./logger.js";
import { RejectionStreakTracker } from "./rejectionTracker.js";

const cli = parseCliArgs(process.argv.slice(2));
const loaded = loadConfig();
const log = createLogger(loaded.logFormat);
const deviceSecret = await resolveDeviceSecret(loaded.deviceSecret, {
  networkPassphrase: loaded.networkPassphrase,
});
const ownerPublicKey = loaded.ownerPublicKey ?? Keypair.fromSecret(deviceSecret).publicKey();
const config = { ...loaded, deviceSecret, ownerPublicKey };

const device = await DriftMeshDevice.connect(config);
log.info("device_address", { address: device.address });

// Fetched before registration so --diagnose-epoch can exit without any
// on-chain writes at all, not just without submitting a reading. Cached
// to disk since it never changes for a given deployed contract instance —
// a frequently-restarting process shouldn't pay the RPC round-trip every time.
const cachedEpochZero = getCachedEpochZero(config.validatorContractId);
const epochZero = cachedEpochZero ?? (await device.fetchEpochZero(config.epochSeconds));
if (cachedEpochZero === undefined) {
  setCachedEpochZero(config.validatorContractId, epochZero);
}

if (cli.diagnoseEpoch) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const epoch = currentEpoch(config.epochSeconds, epochZero);
  log.info("epoch_diagnostic", {
    epoch_zero: epochZero,
    epoch_seconds: config.epochSeconds,
    now: nowSeconds,
    current_epoch: epoch,
  });
  process.exit(0);
}

const status = await device.ensureRegistered();
log.info("registration", { status });

const registeredLocation = await device.fetchRegisteredLocation();
const regionMismatch = regionCodeMismatchWarning(
  config.lat,
  config.lon,
  registeredLocation.lat,
  registeredLocation.lon,
  config.regionCellSizeDegrees,
);
if (regionMismatch) {
  log.warn("region_code_mismatch", { detail: regionMismatch });
}

if (config.rewardAssetCode && config.rewardAssetIssuer) {
  const trustlineResult = await ensureTrustline({
    deviceSecret: config.deviceSecret,
    networkPassphrase: config.networkPassphrase,
    horizonUrl: config.horizonUrl,
    assetCode: config.rewardAssetCode,
    assetIssuer: config.rewardAssetIssuer,
  });
  log.info("reward_asset_trustline", { result: trustlineResult });
}

const regionCode = regionCodeFromLatLon(config.lat, config.lon, config.regionCellSizeDegrees);
const simulator = new ReadingSimulator();
const rejectionTracker = new RejectionStreakTracker(config.rejectionWarningThreshold);
log.info("startup", {
  region_code: regionCode,
  submit_interval_ms: config.submitIntervalMs,
  epoch_seconds: config.epochSeconds,
  epoch_zero: epochZero,
});

async function tick(): Promise<void> {
  const epoch = cli.epochOverride ?? currentEpoch(config.epochSeconds, epochZero);
  const value = simulator.next();
  try {
    const accepted = await device.submitReading(regionCode, epoch, value);
    log.info("reading", { epoch, value, accepted });
    if (rejectionTracker.record(accepted)) {
      log.warn("rejection_streak", {
        consecutive_rejections: rejectionTracker.streak,
        detail: "readings are being rejected repeatedly — the sensor may be miscalibrated",
      });
    }
  } catch (err) {
    log.error("submit_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

if (cli.once) {
  await tick();
  process.exit(0);
} else {
  await tick();
  setInterval(tick, config.submitIntervalMs);
}
