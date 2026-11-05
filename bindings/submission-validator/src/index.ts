import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyInitialized"},
  3: {message:"DeviceNotActive"},
  /**
   * The epoch's time window has already closed — its total submission
   * count is final, so late readings can't be allowed to change it.
   */
  4: {message:"EpochClosed"}
}


export interface Client {
  /**
   * Construct and simulate a epoch_end transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Exclusive upper bound of epoch `e`'s window, in ledger seconds:
   * `epoch_zero + (e + 1) * epoch_seconds`.
   */
  epoch_end: ({epoch}: {epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `tolerance_bps` is how far (in basis points of the current regional
   * average) a new reading may deviate and still be accepted, e.g.
   * 2000 = 20%. A minimum absolute floor of 50 (fixed-point units)
   * applies too, so regions averaging near zero aren't impossibly strict.
   * 
   * `epoch_seconds` is the length of one epoch in ledger seconds; it
   * defines the cycle-end cutoff that freezes an epoch's total.
   */
  initialize: ({admin, registry, tolerance_bps, epoch_seconds}: {admin: string, registry: string, tolerance_bps: u32, epoch_seconds: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_epoch_final transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * True once `ledger.timestamp() >= epoch_end(epoch)` — the epoch's
   * window has closed and its total submission count is final.
   */
  is_epoch_final: ({epoch}: {epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a submit_reading transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `value` is a fixed-point reading (e.g. temperature * 100).
   * `region_code` is a coarse geohash-style grid cell the caller
   * computes off-chain from the device's registered lat/lon.
   * Returns whether the reading was accepted as plausible.
   */
  submit_reading: ({device, device_type, region_code, epoch, value}: {device: string, device_type: string, region_code: u32, epoch: u32, value: i32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a get_region_average transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Current rolling average for a region+device-type bucket, 0 if none yet.
   */
  get_region_average: ({region_code, device_type}: {region_code: u32, device_type: string}, options?: MethodOptions) => Promise<AssembledTransaction<i64>>

  /**
   * Construct and simulate a get_submission_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_submission_count: ({device, epoch}: {device: string, epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_total_submissions transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Total accepted readings across *all* devices in an epoch. Frozen
   * once the epoch is final (no readings accepted after the window
   * closes), so this is the stable denominator for proportional payouts.
   */
  get_total_submissions: ({epoch}: {epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAPRGV2aWNlTm90QWN0aXZlAAAAAAMAAACDVGhlIGVwb2NoJ3MgdGltZSB3aW5kb3cgaGFzIGFscmVhZHkgY2xvc2VkIOKAlCBpdHMgdG90YWwgc3VibWlzc2lvbgpjb3VudCBpcyBmaW5hbCwgc28gbGF0ZSByZWFkaW5ncyBjYW4ndCBiZSBhbGxvd2VkIHRvIGNoYW5nZSBpdC4AAAAAC0Vwb2NoQ2xvc2VkAAAAAAQ=",
        "AAAABQAAAJxFbWl0dGVkIHdoZW4gYSByZWFkaW5nIGlzIHN1Ym1pdHRlZCAoYWNjZXB0ZWQgb3IgcmVqZWN0ZWQgYnkgb3V0bGllciBjaGVjaykuClRvcGljczogWyJyZWFkaW5nIiwgZGV2aWNlX2FkZHJlc3NdCkRhdGE6IChyZWdpb25fY29kZSwgZXBvY2gsIHZhbHVlLCBhY2NlcHRlZCkAAAAAAAAAB1JlYWRpbmcAAAAAAQAAAAdyZWFkaW5nAAAAAAUAAAAAAAAABmRldmljZQAAAAAAEwAAAAEAAAAAAAAAC3JlZ2lvbl9jb2RlAAAAAAQAAAAAAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAAAAAAAAV2YWx1ZQAAAAAAAAUAAAAAAAAAAAAAAAhhY2NlcHRlZAAAAAEAAAAAAAAAAg==",
        "AAAAAAAAAGdFeGNsdXNpdmUgdXBwZXIgYm91bmQgb2YgZXBvY2ggYGVgJ3Mgd2luZG93LCBpbiBsZWRnZXIgc2Vjb25kczoKYGVwb2NoX3plcm8gKyAoZSArIDEpICogZXBvY2hfc2Vjb25kc2AuAAAAAAllcG9jaF9lbmQAAAAAAAABAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAABAAAABg==",
        "AAAAAAAAAYVgdG9sZXJhbmNlX2Jwc2AgaXMgaG93IGZhciAoaW4gYmFzaXMgcG9pbnRzIG9mIHRoZSBjdXJyZW50IHJlZ2lvbmFsCmF2ZXJhZ2UpIGEgbmV3IHJlYWRpbmcgbWF5IGRldmlhdGUgYW5kIHN0aWxsIGJlIGFjY2VwdGVkLCBlLmcuCjIwMDAgPSAyMCUuIEEgbWluaW11bSBhYnNvbHV0ZSBmbG9vciBvZiA1MCAoZml4ZWQtcG9pbnQgdW5pdHMpCmFwcGxpZXMgdG9vLCBzbyByZWdpb25zIGF2ZXJhZ2luZyBuZWFyIHplcm8gYXJlbid0IGltcG9zc2libHkgc3RyaWN0LgoKYGVwb2NoX3NlY29uZHNgIGlzIHRoZSBsZW5ndGggb2Ygb25lIGVwb2NoIGluIGxlZGdlciBzZWNvbmRzOyBpdApkZWZpbmVzIHRoZSBjeWNsZS1lbmQgY3V0b2ZmIHRoYXQgZnJlZXplcyBhbiBlcG9jaCdzIHRvdGFsLgAAAAAAAAppbml0aWFsaXplAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHJlZ2lzdHJ5AAAAEwAAAAAAAAANdG9sZXJhbmNlX2JwcwAAAAAAAAQAAAAAAAAADWVwb2NoX3NlY29uZHMAAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAH1UcnVlIG9uY2UgYGxlZGdlci50aW1lc3RhbXAoKSA+PSBlcG9jaF9lbmQoZXBvY2gpYCDigJQgdGhlIGVwb2NoJ3MKd2luZG93IGhhcyBjbG9zZWQgYW5kIGl0cyB0b3RhbCBzdWJtaXNzaW9uIGNvdW50IGlzIGZpbmFsLgAAAAAAAA5pc19lcG9jaF9maW5hbAAAAAAAAQAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAQAAAAE=",
        "AAAAAAAAAOdgdmFsdWVgIGlzIGEgZml4ZWQtcG9pbnQgcmVhZGluZyAoZS5nLiB0ZW1wZXJhdHVyZSAqIDEwMCkuCmByZWdpb25fY29kZWAgaXMgYSBjb2Fyc2UgZ2VvaGFzaC1zdHlsZSBncmlkIGNlbGwgdGhlIGNhbGxlcgpjb21wdXRlcyBvZmYtY2hhaW4gZnJvbSB0aGUgZGV2aWNlJ3MgcmVnaXN0ZXJlZCBsYXQvbG9uLgpSZXR1cm5zIHdoZXRoZXIgdGhlIHJlYWRpbmcgd2FzIGFjY2VwdGVkIGFzIHBsYXVzaWJsZS4AAAAADnN1Ym1pdF9yZWFkaW5nAAAAAAAFAAAAAAAAAAZkZXZpY2UAAAAAABMAAAAAAAAAC2RldmljZV90eXBlAAAAABEAAAAAAAAAC3JlZ2lvbl9jb2RlAAAAAAQAAAAAAAAABWVwb2NoAAAAAAAABAAAAAAAAAAFdmFsdWUAAAAAAAAFAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAAEdDdXJyZW50IHJvbGxpbmcgYXZlcmFnZSBmb3IgYSByZWdpb24rZGV2aWNlLXR5cGUgYnVja2V0LCAwIGlmIG5vbmUgeWV0LgAAAAASZ2V0X3JlZ2lvbl9hdmVyYWdlAAAAAAACAAAAAAAAAAtyZWdpb25fY29kZQAAAAAEAAAAAAAAAAtkZXZpY2VfdHlwZQAAAAARAAAAAQAAAAc=",
        "AAAAAAAAAAAAAAAUZ2V0X3N1Ym1pc3Npb25fY291bnQAAAACAAAAAAAAAAZkZXZpY2UAAAAAABMAAAAAAAAABWVwb2NoAAAAAAAABAAAAAEAAAAE",
        "AAAAAAAAAMRUb3RhbCBhY2NlcHRlZCByZWFkaW5ncyBhY3Jvc3MgKmFsbCogZGV2aWNlcyBpbiBhbiBlcG9jaC4gRnJvemVuCm9uY2UgdGhlIGVwb2NoIGlzIGZpbmFsIChubyByZWFkaW5ncyBhY2NlcHRlZCBhZnRlciB0aGUgd2luZG93CmNsb3NlcyksIHNvIHRoaXMgaXMgdGhlIHN0YWJsZSBkZW5vbWluYXRvciBmb3IgcHJvcG9ydGlvbmFsIHBheW91dHMuAAAAFWdldF90b3RhbF9zdWJtaXNzaW9ucwAAAAAAAAEAAAAAAAAABWVwb2NoAAAAAAAABAAAAAEAAAAE" ]),
      options
    )
  }
  public readonly fromJSON = {
    epoch_end: this.txFromJSON<u64>,
        initialize: this.txFromJSON<Result<void>>,
        is_epoch_final: this.txFromJSON<boolean>,
        submit_reading: this.txFromJSON<Result<boolean>>,
        get_region_average: this.txFromJSON<i64>,
        get_submission_count: this.txFromJSON<u32>,
        get_total_submissions: this.txFromJSON<u32>
  }
}