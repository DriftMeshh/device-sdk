import { loadConfig } from "./config.js";
import { DriftMeshDevice } from "./client.js";
import { regionCodeFromLatLon } from "./region.js";
import { ReadingSimulator, currentEpoch } from "./simulate.js";

const config = loadConfig();
const device = await DriftMeshDevice.connect(config);
console.log(`[device-sdk] device address: ${device.address}`);

const status = await device.ensureRegistered();
console.log(`[device-sdk] registration: ${status}`);

const regionCode = regionCodeFromLatLon(config.lat, config.lon, config.regionCellSizeDegrees);
const simulator = new ReadingSimulator();
console.log(
  `[device-sdk] region_code=${regionCode}, submitting every ${config.submitIntervalMs}ms ` +
    `(epoch window = ${config.epochSeconds}s)`,
);

async function tick(): Promise<void> {
  const epoch = currentEpoch(config.epochSeconds);
  const value = simulator.next();
  try {
    const accepted = await device.submitReading(regionCode, epoch, value);
    console.log(`[device-sdk] epoch=${epoch} value=${value} accepted=${accepted}`);
  } catch (err) {
    console.error("[device-sdk] submit failed:", err);
  }
}

await tick();
setInterval(tick, config.submitIntervalMs);
