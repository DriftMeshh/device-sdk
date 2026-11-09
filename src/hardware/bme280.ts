/**
 * Hardware integration for the Bosch BME280 temperature/humidity/pressure
 * sensor over I²C, targeting a Raspberry Pi running Linux with the
 * `i2c-bcm2835` or `i2c-dev` kernel module loaded.
 *
 * Wiring (Pi GPIO header → BME280 breakout):
 *   Pin 1  (3V3)  → VIN
 *   Pin 3  (SDA1) → SDA
 *   Pin 5  (SCL1) → SCL
 *   Pin 9  (GND)  → GND
 *
 * Kernel module prerequisites (run once, or add to /etc/modules):
 *   sudo modprobe i2c-dev
 *
 * Default I²C address: 0x76 (SDO pulled low).  If your breakout pulls SDO
 * high it will be 0x77 — set I2C_ADDRESS=0x77 in .env to override.
 *
 * Exposes the same `next(): number` interface as `ReadingSimulator` so
 * `index.ts` can swap between them without touching any submission logic.
 * Values are fixed-point integers (temperature °C × 100, e.g. 23.15 °C →
 * 2315) to match the `u32` scale expected by `submission-validator`.
 *
 * Requires:
 *   npm install i2c-bus@^5.2.3 bme280-sensor@^0.0.10
 */

import i2c from "i2c-bus";
import Bme280 from "bme280-sensor";

export interface Bme280Config {
  /** I²C bus number — 1 on all modern Raspberry Pi models. Default 1. */
  i2cBusNumber?: number;
  /** I²C device address — 0x76 (SDO low) or 0x77 (SDO high). Default 0x76. */
  i2cAddress?: number;
}

/**
 * Reads temperature from a BME280 over I²C and returns it as a fixed-point
 * integer (°C × 100) compatible with `submission-validator`'s `value` field.
 *
 * Usage:
 *   const sensor = await Bme280Reader.open();
 *   const value = await sensor.next();   // e.g. 2315 for 23.15 °C
 */
export class Bme280Reader {
  private constructor(private readonly sensor: InstanceType<typeof Bme280>) {}

  /**
   * Opens the I²C bus and initialises the BME280.  Throws if the sensor is
   * unreachable (wrong address, bus not enabled, module not loaded, etc.).
   */
  static async open(cfg: Bme280Config = {}): Promise<Bme280Reader> {
    const busNumber = cfg.i2cBusNumber ?? 1;
    const address = cfg.i2cAddress ?? 0x76;

    const bus = await i2c.openPromisified(busNumber);
    const sensor = new Bme280({ i2cBusNo: busNumber, i2cAddress: address, i2cBus: bus });
    await sensor.init();
    return new Bme280Reader(sensor);
  }

  /**
   * Reads the current temperature and returns it as a fixed-point integer
   * (°C × 100).  The same interface as `ReadingSimulator.next()`, so
   * `index.ts` needs no structural changes to swap in real hardware.
   *
   * Rounds half-up to the nearest integer to avoid silent truncation.
   */
  async next(): Promise<number> {
    const data = await this.sensor.readSensorData();
    return Math.round(data.temperature_C * 100);
  }
}
