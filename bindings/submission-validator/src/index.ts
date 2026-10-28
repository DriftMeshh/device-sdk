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
  3: {message:"DeviceNotActive"}
}

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `tolerance_bps` is how far (in basis points of the current regional
   * average) a new reading may deviate and still be accepted, e.g.
   * 2000 = 20%. A minimum absolute floor of 50 (fixed-point units)
   * applies too, so regions averaging near zero aren't impossibly strict.
   */
  initialize: ({admin, registry, tolerance_bps}: {admin: string, registry: string, tolerance_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAAwAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAPRGV2aWNlTm90QWN0aXZlAAAAAAM=",
        "AAAAAAAAAQdgdG9sZXJhbmNlX2Jwc2AgaXMgaG93IGZhciAoaW4gYmFzaXMgcG9pbnRzIG9mIHRoZSBjdXJyZW50IHJlZ2lvbmFsCmF2ZXJhZ2UpIGEgbmV3IHJlYWRpbmcgbWF5IGRldmlhdGUgYW5kIHN0aWxsIGJlIGFjY2VwdGVkLCBlLmcuCjIwMDAgPSAyMCUuIEEgbWluaW11bSBhYnNvbHV0ZSBmbG9vciBvZiA1MCAoZml4ZWQtcG9pbnQgdW5pdHMpCmFwcGxpZXMgdG9vLCBzbyByZWdpb25zIGF2ZXJhZ2luZyBuZWFyIHplcm8gYXJlbid0IGltcG9zc2libHkgc3RyaWN0LgAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhyZWdpc3RyeQAAABMAAAAAAAAADXRvbGVyYW5jZV9icHMAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAOdgdmFsdWVgIGlzIGEgZml4ZWQtcG9pbnQgcmVhZGluZyAoZS5nLiB0ZW1wZXJhdHVyZSAqIDEwMCkuCmByZWdpb25fY29kZWAgaXMgYSBjb2Fyc2UgZ2VvaGFzaC1zdHlsZSBncmlkIGNlbGwgdGhlIGNhbGxlcgpjb21wdXRlcyBvZmYtY2hhaW4gZnJvbSB0aGUgZGV2aWNlJ3MgcmVnaXN0ZXJlZCBsYXQvbG9uLgpSZXR1cm5zIHdoZXRoZXIgdGhlIHJlYWRpbmcgd2FzIGFjY2VwdGVkIGFzIHBsYXVzaWJsZS4AAAAADnN1Ym1pdF9yZWFkaW5nAAAAAAAFAAAAAAAAAAZkZXZpY2UAAAAAABMAAAAAAAAAC2RldmljZV90eXBlAAAAABEAAAAAAAAAC3JlZ2lvbl9jb2RlAAAAAAQAAAAAAAAABWVwb2NoAAAAAAAABAAAAAAAAAAFdmFsdWUAAAAAAAAFAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAAEdDdXJyZW50IHJvbGxpbmcgYXZlcmFnZSBmb3IgYSByZWdpb24rZGV2aWNlLXR5cGUgYnVja2V0LCAwIGlmIG5vbmUgeWV0LgAAAAASZ2V0X3JlZ2lvbl9hdmVyYWdlAAAAAAACAAAAAAAAAAtyZWdpb25fY29kZQAAAAAEAAAAAAAAAAtkZXZpY2VfdHlwZQAAAAARAAAAAQAAAAc=",
        "AAAAAAAAAAAAAAAUZ2V0X3N1Ym1pc3Npb25fY291bnQAAAACAAAAAAAAAAZkZXZpY2UAAAAAABMAAAAAAAAABWVwb2NoAAAAAAAABAAAAAEAAAAE" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<Result<void>>,
        submit_reading: this.txFromJSON<Result<boolean>>,
        get_region_average: this.txFromJSON<i64>,
        get_submission_count: this.txFromJSON<u32>
  }
}