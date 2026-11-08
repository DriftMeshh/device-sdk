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
  3: {message:"AlreadyClaimed"},
  4: {message:"NothingToClaim"},
  /**
   * The epoch's window hasn't closed yet, so its total submission count
   * isn't final and payouts can't be computed fairly. Claim again after
   * the epoch ends.
   */
  5: {message:"EpochNotFinal"},
  /**
   * The contract has been paused by the admin. All claim calls are
   * rejected until the admin calls unpause().
   */
  6: {message:"ContractPaused"},
  /**
   * The token transfer to the device failed — in practice this almost
   * always means the device's account doesn't hold a trustline to the
   * reward asset yet (a classic-Stellar prerequisite for a SAC-wrapped
   * asset transfer, not something this contract can establish on the
   * device's behalf). Establish a trustline to the reward asset and
   * claim again.
   */
  7: {message:"TransferFailed"}
}




export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A device claims its proportional share of an epoch's pool. The epoch
   * must be final (its total is frozen), and each device can claim once
   * per epoch. The first claim for a finalized epoch snapshots the pool;
   * `payout = epoch_pool * device_count / total`, with the live balance
   * used only as a defensive cap that never triggers in normal flow.
   */
  claim: ({device, epoch}: {device: string, epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin pauses all claim operations. Useful during an emergency or
   * while a dispute is being investigated. Idempotent: calling pause
   * when already paused has no effect.
   */
  pause: ({admin_caller}: {admin_caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin unpauses the contract, re-enabling claims. Idempotent.
   */
  unpause: ({admin_caller}: {admin_caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a epoch_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The one-time pool snapshot for an epoch (0 if no one has claimed for
   * it yet). Useful for inspecting what a finalized epoch will split.
   */
  epoch_pool: ({epoch}: {epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, validator, reward_token}: {admin: string, validator: string, reward_token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a has_claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_claimed: ({device, epoch}: {device: string, epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a pool_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How much reward token this contract currently holds — i.e. what's
   * available to be paid out (across all not-yet-claimed epochs).
   */
  pool_balance: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a preview_payout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read-only preview of what `claim(device, epoch)` would currently pay
   * out, without snapshotting the pool or transferring anything. Lets a
   * device operator or the frontend show an expected amount before
   * claiming.
   * 
   * If the epoch's pool has already been snapshotted (someone has
   * claimed for it), this returns the exact amount `claim` will pay —
   * the two can never disagree, since both read the same snapshot.
   * 
   * If nobody has claimed for this epoch yet, there is no snapshot to
   * read, so this previews against the contract's *current live
   * balance* instead. That preview is only an estimate: the real
   * snapshot `claim` takes is whatever the balance is at the moment of
   * the *first* claim, which could differ if the balance changes (e.g.
   * another subscription payment arrives) between this preview and that
   * claim. Chose this over returning an error for the not-yet-claimed
   * case because showing an estimate is more useful to a caller than no
   * information at all, as long as the estimate's limitation is clear.
   */
  preview_payout: ({device, epoch}: {device: string, epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAOQWxyZWFkeUNsYWltZWQAAAAAAAMAAAAAAAAADk5vdGhpbmdUb0NsYWltAAAAAAAEAAAAl1RoZSBlcG9jaCdzIHdpbmRvdyBoYXNuJ3QgY2xvc2VkIHlldCwgc28gaXRzIHRvdGFsIHN1Ym1pc3Npb24gY291bnQKaXNuJ3QgZmluYWwgYW5kIHBheW91dHMgY2FuJ3QgYmUgY29tcHV0ZWQgZmFpcmx5LiBDbGFpbSBhZ2FpbiBhZnRlcgp0aGUgZXBvY2ggZW5kcy4AAAAADUVwb2NoTm90RmluYWwAAAAAAAAFAAAAaFRoZSBjb250cmFjdCBoYXMgYmVlbiBwYXVzZWQgYnkgdGhlIGFkbWluLiBBbGwgY2xhaW0gY2FsbHMgYXJlCnJlamVjdGVkIHVudGlsIHRoZSBhZG1pbiBjYWxscyB1bnBhdXNlKCkuAAAADkNvbnRyYWN0UGF1c2VkAAAAAAAGAAABVlRoZSB0b2tlbiB0cmFuc2ZlciB0byB0aGUgZGV2aWNlIGZhaWxlZCDigJQgaW4gcHJhY3RpY2UgdGhpcyBhbG1vc3QKYWx3YXlzIG1lYW5zIHRoZSBkZXZpY2UncyBhY2NvdW50IGRvZXNuJ3QgaG9sZCBhIHRydXN0bGluZSB0byB0aGUKcmV3YXJkIGFzc2V0IHlldCAoYSBjbGFzc2ljLVN0ZWxsYXIgcHJlcmVxdWlzaXRlIGZvciBhIFNBQy13cmFwcGVkCmFzc2V0IHRyYW5zZmVyLCBub3Qgc29tZXRoaW5nIHRoaXMgY29udHJhY3QgY2FuIGVzdGFibGlzaCBvbiB0aGUKZGV2aWNlJ3MgYmVoYWxmKS4gRXN0YWJsaXNoIGEgdHJ1c3RsaW5lIHRvIHRoZSByZXdhcmQgYXNzZXQgYW5kCmNsYWltIGFnYWluLgAAAAAADlRyYW5zZmVyRmFpbGVkAAAAAAAH",
        "AAAABQAAAXVFbWl0dGVkIHdoZW5ldmVyIHRoZSBhZG1pbiBjYWxscyBgcGF1c2VgLCBzbyBgaW5kZXhlcmAgYW5kIG1vbml0b3JpbmcKc2NyaXB0cyBjYW4gb2JzZXJ2ZSBpdCB3aXRob3V0IHBvbGxpbmcgYGlzX3BhdXNlZGAuIEVtaXR0ZWQgb24gZXZlcnkKY2FsbCwgbm90IGp1c3Qgb24gYW4gYWN0dWFsIGZhbHNlLT50cnVlIHRyYW5zaXRpb24sIHNpbmNlIGBwYXVzZWAgaXMKaWRlbXBvdGVudCBhbmQgYSByZXBlYXRlZCBwYXVzZSBpcyBzdGlsbCBhIG1lYW5pbmdmdWwgYWRtaW4gYWN0aW9uIHRvCmxvZyAoZS5nLiByZS1jb25maXJtaW5nIHRoZSBob2xkIGR1cmluZyBhbiBvbmdvaW5nIGluY2lkZW50KS4KVG9waWNzOiBbInBhdXNlZCIsIGFkbWluX2FkZHJlc3NdAAAAAAAAAAAAAAZQYXVzZWQAAAAAAAEAAAAGcGF1c2VkAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAAHxFbWl0dGVkIHdoZW4gYSBkZXZpY2Ugc3VjY2Vzc2Z1bGx5IGNsYWltcyBpdHMgcGF5b3V0IGZvciBhbiBlcG9jaC4KVG9waWNzOiBbImNsYWltZWQiLCBkZXZpY2VfYWRkcmVzc10KRGF0YTogKGVwb2NoLCBwYXlvdXQpAAAAAAAAAAdDbGFpbWVkAAAAAAEAAAAHY2xhaW1lZAAAAAADAAAAAAAAAAZkZXZpY2UAAAAAABMAAAABAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAAAAAAAAZwYXlvdXQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAKtFbWl0dGVkIHdoZW5ldmVyIHRoZSBhZG1pbiBjYWxscyBgdW5wYXVzZWAuIFNlZSBgUGF1c2VkYCBmb3Igd2h5IHRoaXMKZmlyZXMgb24gZXZlcnkgY2FsbCByYXRoZXIgdGhhbiBvbmx5IG9uIGEgdHJ1ZS0+ZmFsc2UgdHJhbnNpdGlvbi4KVG9waWNzOiBbInVucGF1c2VkIiwgYWRtaW5fYWRkcmVzc10AAAAAAAAAAAhVbnBhdXNlZAAAAAEAAAAIdW5wYXVzZWQAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==",
        "AAAAAAAAAVJBIGRldmljZSBjbGFpbXMgaXRzIHByb3BvcnRpb25hbCBzaGFyZSBvZiBhbiBlcG9jaCdzIHBvb2wuIFRoZSBlcG9jaAptdXN0IGJlIGZpbmFsIChpdHMgdG90YWwgaXMgZnJvemVuKSwgYW5kIGVhY2ggZGV2aWNlIGNhbiBjbGFpbSBvbmNlCnBlciBlcG9jaC4gVGhlIGZpcnN0IGNsYWltIGZvciBhIGZpbmFsaXplZCBlcG9jaCBzbmFwc2hvdHMgdGhlIHBvb2w7CmBwYXlvdXQgPSBlcG9jaF9wb29sICogZGV2aWNlX2NvdW50IC8gdG90YWxgLCB3aXRoIHRoZSBsaXZlIGJhbGFuY2UKdXNlZCBvbmx5IGFzIGEgZGVmZW5zaXZlIGNhcCB0aGF0IG5ldmVyIHRyaWdnZXJzIGluIG5vcm1hbCBmbG93LgAAAAAABWNsYWltAAAAAAAAAgAAAAAAAAAGZGV2aWNlAAAAAAATAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAKRBZG1pbiBwYXVzZXMgYWxsIGNsYWltIG9wZXJhdGlvbnMuIFVzZWZ1bCBkdXJpbmcgYW4gZW1lcmdlbmN5IG9yCndoaWxlIGEgZGlzcHV0ZSBpcyBiZWluZyBpbnZlc3RpZ2F0ZWQuIElkZW1wb3RlbnQ6IGNhbGxpbmcgcGF1c2UKd2hlbiBhbHJlYWR5IHBhdXNlZCBoYXMgbm8gZWZmZWN0LgAAAAVwYXVzZQAAAAAAAAEAAAAAAAAADGFkbWluX2NhbGxlcgAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADxBZG1pbiB1bnBhdXNlcyB0aGUgY29udHJhY3QsIHJlLWVuYWJsaW5nIGNsYWltcy4gSWRlbXBvdGVudC4AAAAHdW5wYXVzZQAAAAABAAAAAAAAAAxhZG1pbl9jYWxsZXIAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAIZUaGUgb25lLXRpbWUgcG9vbCBzbmFwc2hvdCBmb3IgYW4gZXBvY2ggKDAgaWYgbm8gb25lIGhhcyBjbGFpbWVkIGZvcgppdCB5ZXQpLiBVc2VmdWwgZm9yIGluc3BlY3Rpbmcgd2hhdCBhIGZpbmFsaXplZCBlcG9jaCB3aWxsIHNwbGl0LgAAAAAACmVwb2NoX3Bvb2wAAAAAAAEAAAAAAAAABWVwb2NoAAAAAAAABAAAAAEAAAAL",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAl2YWxpZGF0b3IAAAAAAAATAAAAAAAAAAxyZXdhcmRfdG9rZW4AAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAALaGFzX2NsYWltZWQAAAAAAgAAAAAAAAAGZGV2aWNlAAAAAAATAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAABAAAAAQ==",
        "AAAAAAAAAIFIb3cgbXVjaCByZXdhcmQgdG9rZW4gdGhpcyBjb250cmFjdCBjdXJyZW50bHkgaG9sZHMg4oCUIGkuZS4gd2hhdCdzCmF2YWlsYWJsZSB0byBiZSBwYWlkIG91dCAoYWNyb3NzIGFsbCBub3QteWV0LWNsYWltZWQgZXBvY2hzKS4AAAAAAAAMcG9vbF9iYWxhbmNlAAAAAAAAAAEAAAAL",
        "AAAAAAAAA+JSZWFkLW9ubHkgcHJldmlldyBvZiB3aGF0IGBjbGFpbShkZXZpY2UsIGVwb2NoKWAgd291bGQgY3VycmVudGx5IHBheQpvdXQsIHdpdGhvdXQgc25hcHNob3R0aW5nIHRoZSBwb29sIG9yIHRyYW5zZmVycmluZyBhbnl0aGluZy4gTGV0cyBhCmRldmljZSBvcGVyYXRvciBvciB0aGUgZnJvbnRlbmQgc2hvdyBhbiBleHBlY3RlZCBhbW91bnQgYmVmb3JlCmNsYWltaW5nLgoKSWYgdGhlIGVwb2NoJ3MgcG9vbCBoYXMgYWxyZWFkeSBiZWVuIHNuYXBzaG90dGVkIChzb21lb25lIGhhcwpjbGFpbWVkIGZvciBpdCksIHRoaXMgcmV0dXJucyB0aGUgZXhhY3QgYW1vdW50IGBjbGFpbWAgd2lsbCBwYXkg4oCUCnRoZSB0d28gY2FuIG5ldmVyIGRpc2FncmVlLCBzaW5jZSBib3RoIHJlYWQgdGhlIHNhbWUgc25hcHNob3QuCgpJZiBub2JvZHkgaGFzIGNsYWltZWQgZm9yIHRoaXMgZXBvY2ggeWV0LCB0aGVyZSBpcyBubyBzbmFwc2hvdCB0bwpyZWFkLCBzbyB0aGlzIHByZXZpZXdzIGFnYWluc3QgdGhlIGNvbnRyYWN0J3MgKmN1cnJlbnQgbGl2ZQpiYWxhbmNlKiBpbnN0ZWFkLiBUaGF0IHByZXZpZXcgaXMgb25seSBhbiBlc3RpbWF0ZTogdGhlIHJlYWwKc25hcHNob3QgYGNsYWltYCB0YWtlcyBpcyB3aGF0ZXZlciB0aGUgYmFsYW5jZSBpcyBhdCB0aGUgbW9tZW50IG9mCnRoZSAqZmlyc3QqIGNsYWltLCB3aGljaCBjb3VsZCBkaWZmZXIgaWYgdGhlIGJhbGFuY2UgY2hhbmdlcyAoZS5nLgphbm90aGVyIHN1YnNjcmlwdGlvbiBwYXltZW50IGFycml2ZXMpIGJldHdlZW4gdGhpcyBwcmV2aWV3IGFuZCB0aGF0CmNsYWltLiBDaG9zZSB0aGlzIG92ZXIgcmV0dXJuaW5nIGFuIGVycm9yIGZvciB0aGUgbm90LXlldC1jbGFpbWVkCmNhc2UgYmVjYXVzZSBzaG93aW5nIGFuIGVzdGltYXRlIGlzIG1vcmUgdXNlZnVsIHRvIGEgY2FsbGVyIHRoYW4gbm8KaW5mb3JtYXRpb24gYXQgYWxsLCBhcyBsb25nIGFzIHRoZSBlc3RpbWF0ZSdzIGxpbWl0YXRpb24gaXMgY2xlYXIuAAAAAAAOcHJldmlld19wYXlvdXQAAAAAAAIAAAAAAAAABmRldmljZQAAAAAAEwAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAQAAA+kAAAALAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<Result<i128>>,
        pause: this.txFromJSON<Result<void>>,
        unpause: this.txFromJSON<Result<void>>,
        is_paused: this.txFromJSON<boolean>,
        epoch_pool: this.txFromJSON<i128>,
        initialize: this.txFromJSON<Result<void>>,
        has_claimed: this.txFromJSON<boolean>,
        pool_balance: this.txFromJSON<i128>,
        preview_payout: this.txFromJSON<Result<i128>>
  }
}