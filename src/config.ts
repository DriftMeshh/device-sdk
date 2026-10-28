export interface DeviceSdkConfig {
  deviceSecret: string;
  ownerPublicKey: string;
  deviceType: string;
  lat: number;
  lon: number;
  rpcUrl: string;
  networkPassphrase: string;
  registryContractId: string;
  validatorContractId: string;
  regionCellSizeDegrees: number;
  epochSeconds: number;
  submitIntervalMs: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required env var ${key}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DeviceSdkConfig {
  return {
    deviceSecret: required(env, "DEVICE_SECRET"),
    ownerPublicKey: required(env, "OWNER_PUBLIC_KEY"),
    deviceType: env.DEVICE_TYPE ?? "weather",
    lat: Number(env.LAT ?? 0),
    lon: Number(env.LON ?? 0),
    rpcUrl: env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
    registryContractId: required(env, "DEVICE_REGISTRY_CONTRACT_ID"),
    validatorContractId: required(env, "SUBMISSION_VALIDATOR_CONTRACT_ID"),
    regionCellSizeDegrees: Number(env.REGION_CELL_SIZE_DEGREES ?? 0.1),
    epochSeconds: Number(env.EPOCH_SECONDS ?? 3600),
    submitIntervalMs: Number(env.SUBMIT_INTERVAL_MS ?? 60_000),
  };
}
