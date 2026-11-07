import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "./config.js";
import { DriftMeshDevice, ensureTrustline } from "./client.js";
import { regionCodeFromLatLon } from "./region.js";
import { ReadingSimulator, currentEpoch } from "./simulate.js";
import { resolveDeviceSecret } from "./identity.js";
import { parseCliArgs } from "./cli.js";
import { getCachedEpochZero, setCachedEpochZero } from "./epochCache.js";

const cli = parseCliArgs(process.argv.slice(2));
const loaded = loadConfig();
const deviceSecret = await resolveDeviceSecret(loaded.deviceSecret, {
  networkPassphrase: loaded.networkPassphrase,
});
const ownerPublicKey = loaded.ownerPublicKey ?? Keypair.fromSecret(deviceSecret).publicKey();
const config = { ...loaded, deviceSecret, ownerPublicKey };

const device = await DriftMeshDevice.connect(config);
console.log(`[device-sdk] device address: ${device.address}`);

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
  console.log(
    `[device-sdk] epoch_zero=${epochZero} epoch_seconds=${config.epochSeconds} ` +
      `now=${nowSeconds} current_epoch=${epoch}`,
  );
  process.exit(0);
}

const status = await device.ensureRegistered();
console.log(`[device-sdk] registration: ${status}`);

if (config.rewardAssetCode && config.rewardAssetIssuer) {
  const trustlineResult = await ensureTrustline({
    deviceSecret: config.deviceSecret,
    networkPassphrase: config.networkPassphrase,
    horizonUrl: config.horizonUrl,
    assetCode: config.rewardAssetCode,
    assetIssuer: config.rewardAssetIssuer,
  });
  console.log(`[device-sdk] reward asset trustline: ${trustlineResult}`);
}

const regionCode = regionCodeFromLatLon(config.lat, config.lon, config.regionCellSizeDegrees);
const simulator = new ReadingSimulator();
console.log(
  `[device-sdk] region_code=${regionCode}, submitting every ${config.submitIntervalMs}ms ` +
    `(epoch window = ${config.epochSeconds}s, epoch_zero=${epochZero})`,
);

async function tick(): Promise<void> {
  const epoch = cli.epochOverride ?? currentEpoch(config.epochSeconds, epochZero);
  const value = simulator.next();
  try {
    const accepted = await device.submitReading(regionCode, epoch, value);
    console.log(`[device-sdk] epoch=${epoch} value=${value} accepted=${accepted}`);
  } catch (err) {
    console.error("[device-sdk] submit failed:", err);
  }
}

if (cli.once) {
  await tick();
  process.exit(0);
} else {
  await tick();
  setInterval(tick, config.submitIntervalMs);
}
