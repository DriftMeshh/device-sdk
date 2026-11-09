/**
 * `bme280-sensor` ships no TypeScript types (confirmed: no @types/bme280-sensor
 * package exists on npm either). Minimal ambient declaration covering only
 * what bme280.ts actually uses, kept local to src/hardware/ since nothing
 * else in this SDK touches this package.
 */
declare module "bme280-sensor" {
  import type { PromisifiedBus } from "i2c-bus";

  export interface Bme280Options {
    i2cBusNo: number;
    i2cAddress: number;
    i2cBus: PromisifiedBus;
  }

  export interface Bme280SensorData {
    temperature_C: number;
    humidity: number;
    pressure_hPa: number;
  }

  export default class Bme280 {
    constructor(options: Bme280Options);
    init(): Promise<void>;
    readSensorData(): Promise<Bme280SensorData>;
  }
}
