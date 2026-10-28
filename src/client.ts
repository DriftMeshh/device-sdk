import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client as DeviceRegistryClient } from "device-registry";
import { Client as SubmissionValidatorClient } from "submission-validator";

export interface DeviceClientConfig {
  deviceSecret: string;
  ownerPublicKey: string;
  deviceType: string;
  lat: number;
  lon: number;
  rpcUrl: string;
  networkPassphrase: string;
  registryContractId: string;
  validatorContractId: string;
}

// Matches device-registry's documented fixed-point scale for lat/lon
// (degrees * 1e4), since Soroban has no floating-point type.
const LAT_LON_FIXED_POINT = 10_000;

export type RegistrationResult = "already_active" | "registered";

export class DriftMeshDevice {
  readonly address: string;

  private constructor(
    private readonly config: DeviceClientConfig,
    private readonly registry: DeviceRegistryClient,
    private readonly validator: SubmissionValidatorClient,
  ) {
    this.address = Keypair.fromSecret(config.deviceSecret).publicKey();
  }

  static async connect(config: DeviceClientConfig): Promise<DriftMeshDevice> {
    const keypair = Keypair.fromSecret(config.deviceSecret);
    const signer = basicNodeSigner(keypair, config.networkPassphrase);
    const base = {
      publicKey: keypair.publicKey(),
      signTransaction: signer.signTransaction,
      signAuthEntry: signer.signAuthEntry,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      allowHttp: config.rpcUrl.startsWith("http://"),
    };

    const registry = new DeviceRegistryClient({
      ...base,
      contractId: config.registryContractId,
    });
    const validator = new SubmissionValidatorClient({
      ...base,
      contractId: config.validatorContractId,
    });

    return new DriftMeshDevice(config, registry, validator);
  }

  /**
   * Registers the device if it isn't already active — safe to call every
   * time the process starts, since `register_device` would otherwise
   * reject a repeat registration.
   */
  async ensureRegistered(): Promise<RegistrationResult> {
    const check = await this.registry.is_active({ device: this.address });
    if (check.result) return "already_active";

    const tx = await this.registry.register_device({
      device: this.address,
      owner: this.config.ownerPublicKey,
      device_type: this.config.deviceType,
      lat: Math.round(this.config.lat * LAT_LON_FIXED_POINT),
      lon: Math.round(this.config.lon * LAT_LON_FIXED_POINT),
    });
    const sent = await tx.signAndSend();
    sent.result.unwrap(); // throws if the contract returned an Error
    return "registered";
  }

  /** Submits one reading. Returns whether the validator accepted it as plausible. */
  async submitReading(regionCode: number, epoch: number, value: number): Promise<boolean> {
    const tx = await this.validator.submit_reading({
      device: this.address,
      device_type: this.config.deviceType,
      region_code: regionCode,
      epoch,
      value,
    });
    const sent = await tx.signAndSend();
    return sent.result.unwrap();
  }
}
