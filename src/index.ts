import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "./config.js";
import { DriftMeshDevice, ensureTrustline } from "./client.js";
import { regionCodeFromLatLon, regionCodeMismatchWarning } from "./region.js";
import { ReadingSimulator, currentEpoch } from "./simulate.js";
import { Bme280Reader } from "./hardware/bme280.js";
import { resolveDeviceSecret } from "./identity.js";
import { parseCliArgs } from "./cli.js";
import { getCachedEpochZero, setCachedEpochZero } from "./epochCache.js";
import { createLogger } from "./logger.js";
import { RejectionStreakTracker } from "./rejectionTracker.js";
import { readSecretFromKeychain, writeSecretToKeychain } from "./keychain.js";

const cli = parseCliArgs(process.argv.slice(2));
const loaded = loadConfig();
const log = createLogger(loaded.logFormat);

// Precedence: an explicit DEVICE_SECRET env var always wins; otherwise,
// with USE_OS_KEYCHAIN=true, a keychain entry (if one exists yet — see
// the setup-keychain command below) is used; otherwise the existing
// file-persisted-or-freshly-generated chain in resolveDeviceSecret runs
// as before.
const keychainSecret = loaded.useOsKeychain
  ? await readSecretFromKeychain(loaded.keychainAccount)
  : undefined;
const deviceSecret = await resolveDeviceSecret(loaded.deviceSecret ?? keychainSecret, {
  networkPassphrase: loaded.networkPassphrase,
});
const ownerPublicKey = loaded.ownerPublicKey ?? Keypair.fromSecret(deviceSecret).publicKey();
const config = { ...loaded, deviceSecret, ownerPublicKey };

if (cli.command === "setup-keychain") {
  // Stores whatever resolveDeviceSecret just resolved above (an explicit
  // DEVICE_SECRET, or a freshly auto-provisioned identity) — the
  // setup-time half of the flow documented in keychain.ts. Never logs
  // the secret itself.
  await writeSecretToKeychain(config.keychainAccount, deviceSecret);
  log.info("keychain_setup_complete", { account: config.keychainAccount });
  process.exit(0);
}

const device = await DriftMeshDevice.connect(config);
log.info("device_address", { address: device.address });

if (cli.command === "deactivate") {
  await device.deactivate();
  log.info("deactivated", { address: device.address });
  process.exit(0);
}

// Fetched before registration so --diagnose-epoch can exit without any
// on-chain writes at all, not just without submitting a reading. Cached
// to disk since it never changes for a given deployed contract instance —
// a frequently-restarting process shouldn't pay the RPC round-trip every time.
const cachedEpochZero = getCachedEpochZero(config.validatorContractId);
const epochZero = cachedEpochZero ?? (await device.fetchEpochZero(config.epochSeconds));
if (cachedEpochZero === undefined) {
  setCachedEpochZero(config.validatorContractId, epochZero);
}

if (cli.command === "claim") {
  // The epoch containing "now" is by definition still open (its window
  // hasn't closed yet), so the most recently *finalized* epoch is simply
  // the one before it — a reasonable default without needing a separate
  // is_epoch_final probe just to pick a starting point.
  const epoch = cli.epoch ?? currentEpoch(config.epochSeconds, epochZero) - 1;
  const payout = await device.claim(epoch);
  log.info("claimed", { epoch, payout: payout.toString() });
  process.exit(0);
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

// Select the reading source: a real BME280 sensor over I²C, or the
// simulator (default — works without any physical hardware).
let readValue: () => Promise<number> | number;
if (config.sensorDriver === "bme280") {
  const bme280 = await Bme280Reader.open({
    i2cBusNumber: config.i2cBusNumber,
    i2cAddress: config.i2cAddress,
  });
  log.info("sensor_driver", { driver: "bme280", bus: config.i2cBusNumber, address: config.i2cAddress.toString(16) });
  readValue = () => bme280.next();
} else {
  const simulator = new ReadingSimulator();
  log.info("sensor_driver", { driver: "simulate" });
  readValue = () => simulator.next();
}

const rejectionTracker = new RejectionStreakTracker(config.rejectionWarningThreshold);
log.info("startup", {
  region_code: regionCode,
  submit_interval_ms: config.submitIntervalMs,
  epoch_seconds: config.epochSeconds,
  epoch_zero: epochZero,
});

// Captured in a local instead of reading cli.epochOverride directly inside
// tick() — TypeScript's narrowing of `cli` to RunArgs (from the `command
// === "claim"` check above) doesn't carry into a separately-declared
// function body.
const epochOverride = cli.epochOverride;

async function tick(): Promise<void> {
  const epoch = epochOverride ?? currentEpoch(config.epochSeconds, epochZero);
  const value = await readValue();
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
