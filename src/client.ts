import { Asset, BASE_FEE, Horizon, Keypair, TransactionBuilder, Operation } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import type { AssembledTransaction, SentTransaction } from "@stellar/stellar-sdk/contract";
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

/**
 * Error `name`s thrown by `@stellar/stellar-sdk`'s `AssembledTransaction` for
 * *deterministic* failures — i.e. failures that resubmitting the exact same
 * `signAndSend()` will not fix. Retrying any of these would be pointless and
 * could mask real bugs:
 *
 *   SimulationFailedError  — the contract / host rejected the call during
 *                            simulation. Re-running the same call yields the
 *                            same deterministic error.
 *   NeedsMoreSignaturesError / NoSignerError / FakeAccountError /
 *   NoSignatureNeededError / NoUnsignedNonInvokerAuthEntriesError /
 *   NotYetSimulatedError   — signing / auth setup is wrong for *this* tx.
 *   UserRejectedError       — the wallet explicitly declined to sign.
 *   InvalidClientRequestError / InternalWalletError — client / wallet bug.
 *   ExpiredStateError / RestoreFailureError — a ledger entry the tx touches
 *                            expired; it needs a restore footprint, not a
 *                            blind resubmit of the same envelope.
 *
 * Everything else is, by elimination, a transport / RPC-level failure (fetch
 * timeouts, connection resets, `ExternalServiceError` from the RPC node, 5xx
 * responses, etc.). The set of "contract / client rejected" errors is closed
 * and enumerable (the SDK defines exactly these classes for logic failures);
 * transport failures bubble up as generic `Error`s or SDK `NetworkError`
 * subclasses, none of which carry the names above. So the default for an
 * unrecognized error is "transient", which is what makes the retry useful for
 * the long tail of network failure shapes.
 */
const NON_RETRYABLE_ERROR_NAMES = new Set<string>([
  "SimulationFailedError",
  "NeedsMoreSignaturesError",
  "NoSignerError",
  "FakeAccountError",
  "NoSignatureNeededError",
  "NoUnsignedNonInvokerAuthEntriesError",
  "NotYetSimulatedError",
  "UserRejectedError",
  "InvalidClientRequestError",
  "InternalWalletError",
  "ExpiredStateError",
  "RestoreFailureError",
]);

/**
 * Classify an error thrown by `signAndSend()` as transient (worth retrying)
 * or not.
 *
 * Contract-level rejections and auth/wallet errors are reported by the SDK
 * as errors carrying one of the {@link NON_RETRYABLE_ERROR_NAMES}; those return
 * `false`. A contract that *returned* an `Err` (rather than failed) is handled
 * differently — it surfaces at `sent.result.unwrap()`, which is deliberately
 * kept *outside* the retry loop, so those never reach this classifier.
 */
export function isTransientError(err: unknown): boolean {
  if (err == null) return false;
  const name = (err as { name?: unknown } | null)?.name;
  if (typeof name === "string" && NON_RETRYABLE_ERROR_NAMES.has(name)) {
    return false;
  }
  return true;
}

export interface SignAndSendRetryOptions {
  /** Maximum number of attempts, including the first. Default 4. */
  maxAttempts?: number;
  /** Base delay (ms) for exponential backoff; delay = base * 2^(attempt-1), capped. Default 500. */
  baseDelayMs?: number;
  /** Upper bound on a single backoff delay (ms). Default 10_000. */
  maxDelayMs?: number;
  /** Override the transient-error classifier (defaults to {@link isTransientError}). */
  isTransientError?: (err: unknown) => boolean;
  /** Override the sleep used between attempts (defaults to a `setTimeout`-based sleep). */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRY = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
} as const;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // `attempt` is the 1-based index of the attempt that just failed; the first
  // backoff happens after attempt 1. base * 2^(attempt-1), capped at maxDelayMs.
  const raw = baseDelayMs * 2 ** (attempt - 1);
  return Math.min(raw, maxDelayMs);
}

/**
 * Submit a pre-built, pre-simulated transaction with exponential backoff,
 * retrying only transient transport/RPC failures.
 *
 * Idempotency reasoning (see issue #7):
 *
 * We retry `tx.signAndSend()` on the *same* `AssembledTransaction` rather than
 * re-building it. Stellar enforces a per-account sequence number on every
 * transaction: a given signed envelope can be included in a ledger at most
 * once. So if a previous attempt actually succeeded on-chain but failed to
 * report success back to the client (e.g. a timeout while polling
 * `getTransaction`), the retry resubmits the same signed envelope with a now
 * stale sequence number and the network rejects it — it is *never*
 * re-executed. The worst case is therefore a false-negative (the client
 * reports a failure for a reading that actually went through), not a
 * duplicate submission. For `submit_reading` this means at most one reading
 * is ever recorded per attempt; for `ensureRegistered` the next startup's
 * `is_active` check will reflect the true on-chain state.
 *
 * Re-building the transaction for a fresh sequence number on each retry could
 * turn that false-negative into a true-positive, but it would risk
 * double-executing non-idempotent calls — which `submit_reading` is not safe
 * against. Retrying the same envelope is the conservative, correct choice.
 *
 * Note: this only retries the `signAndSend` step. Transient failures during
 * the initial `simulate()` (which happens while building the tx inside
 * `submit_reading` / `register_device`, before `signAndSend` is called) are
 * intentionally left to the normal tick-level error handling in `index.ts`,
 * keeping the retry scoped to `signAndSend` as required.
 */
export async function signAndSendWithRetry<T>(
  tx: AssembledTransaction<T>,
  options: SignAndSendRetryOptions = {},
): Promise<SentTransaction<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_RETRY.maxAttempts;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs;
  const isTransient = options.isTransientError ?? isTransientError;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown = new Error(
    "signAndSend retry loop exited without making an attempt (maxAttempts <= 0)",
  );
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await tx.signAndSend();
    } catch (err) {
      lastError = err;
      // Stop immediately on non-transient (contract/auth) errors, and on the
      // final attempt regardless.
      if (!isTransient(err) || attempt === maxAttempts) {
        throw err;
      }
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }
  // Unreachable for any positive maxAttempts: the final iteration always
  // throws. Kept for exhaustiveness / the type-checker.
  throw lastError;
}

export type TrustlineResult = "already_trusted" | "established";

export interface EnsureTrustlineParams {
  deviceSecret: string;
  networkPassphrase: string;
  horizonUrl: string;
  assetCode: string;
  assetIssuer: string;
}

/**
 * A device needs a classic-Stellar trustline to the reward asset before it
 * can receive a payout — Soroban's token contract can't establish this on
 * the recipient's behalf, and a missing trustline surfaces only as an
 * opaque "trustline entry is missing for account" host error from inside
 * `claim()`, discovered the hard way during manual testnet verification
 * (see issue #10). This checks for it and establishes it if needed.
 *
 * Safe to call on every startup: a no-op once the trustline exists. Takes
 * an injectable `horizon` client (defaulting to a real `Horizon.Server`)
 * so this can be unit tested without a live network.
 */
export async function ensureTrustline(
  params: EnsureTrustlineParams,
  horizon: Pick<Horizon.Server, "loadAccount" | "submitTransaction"> = new Horizon.Server(
    params.horizonUrl,
  ),
): Promise<TrustlineResult> {
  const keypair = Keypair.fromSecret(params.deviceSecret);
  const account = await horizon.loadAccount(keypair.publicKey());

  const alreadyTrusts = account.balances.some(
    (balance) =>
      "asset_code" in balance &&
      "asset_issuer" in balance &&
      balance.asset_code === params.assetCode &&
      balance.asset_issuer === params.assetIssuer,
  );
  if (alreadyTrusts) return "already_trusted";

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: params.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(params.assetCode, params.assetIssuer) }))
    .setTimeout(30)
    .build();
  tx.sign(keypair);
  await horizon.submitTransaction(tx);
  return "established";
}

export class DriftMeshDevice {
  readonly address: string;
  private readonly retryOptions: SignAndSendRetryOptions;

  private constructor(
    private readonly config: DeviceClientConfig,
    private readonly registry: DeviceRegistryClient,
    private readonly validator: SubmissionValidatorClient,
    retryOptions: SignAndSendRetryOptions = {},
  ) {
    this.address = Keypair.fromSecret(config.deviceSecret).publicKey();
    this.retryOptions = retryOptions;
  }

  static async connect(
    config: DeviceClientConfig,
    retryOptions: SignAndSendRetryOptions = {},
  ): Promise<DriftMeshDevice> {
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

    return new DriftMeshDevice(config, registry, validator, retryOptions);
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
    const sent = await signAndSendWithRetry(tx, this.retryOptions);
    sent.result.unwrap(); // throws if the contract returned an Error (non-retryable, outside the retry loop)
    return "registered";
  }

  /**
   * Reads back this device's on-chain registered lat/lon. Used to detect
   * drift between the configured LAT/LON (which readings submit under)
   * and what was actually registered — see `regionCodeMismatchWarning`.
   */
  async fetchRegisteredLocation(): Promise<{ lat: number; lon: number }> {
    const tx = await this.registry.get_device({ device: this.address });
    const record = tx.result.unwrap();
    return { lat: record.lat / LAT_LON_FIXED_POINT, lon: record.lon / LAT_LON_FIXED_POINT };
  }

  /**
   * Reads `submission-validator`'s own epoch-zero anchor — its deployment
   * timestamp, which is what epoch numbers are relative to (see
   * `currentEpoch` in simulate.ts). There's no direct getter for it, but
   * `epoch_end(0) == epochZero + epochSeconds`, so epoch 0's end minus the
   * epoch window backs it out. Call this once at startup and cache the
   * result — it never changes for a given deployed contract.
   */
  async fetchEpochZero(epochSeconds: number): Promise<number> {
    const tx = await this.validator.epoch_end({ epoch: 0 });
    return Number(tx.result) - epochSeconds;
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
    const sent = await signAndSendWithRetry(tx, this.retryOptions);
    return sent.result.unwrap();
  }
}
