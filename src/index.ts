import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "./config.js";
import { DriftMeshDevice } from "./client.js";
import { regionCodeFromLatLon } from "./region.js";
import { ReadingSimulator, currentEpoch } from "./simulate.js";
import { resolveDeviceSecret } from "./identity.js";
import { parseCliArgs } from "./cli.js";

const cli = parseCliArgs(process.argv.slice(2));
const loaded = loadConfig();
const deviceSecret = await resolveDeviceSecret(loaded.deviceSecret, {
  networkPassphrase: loaded.networkPassphrase,
});
const ownerPublicKey = loaded.ownerPublicKey ?? Keypair.fromSecret(deviceSecret).publicKey();
const config = { ...loaded, deviceSecret, ownerPublicKey };

const device = await DriftMeshDevice.connect(config);
console.log(`[device-sdk] device address: ${device.address}`);

const status = await device.ensureRegistered();
console.log(`[device-sdk] registration: ${status}`);

const regionCode = regionCodeFromLatLon(config.lat, config.lon, config.regionCellSizeDegrees);
const simulator = new ReadingSimulator();
const epochZero = await device.fetchEpochZero(config.epochSeconds);
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
