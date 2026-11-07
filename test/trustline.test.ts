import { describe, expect, it, vi } from "vitest";
import { Account, Keypair } from "@stellar/stellar-sdk";
import { ensureTrustline } from "../src/client.js";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const ASSET_CODE = "DMU";
const ASSET_ISSUER = Keypair.random().publicKey();

/** A real `Account` (not `Horizon.AccountResponse`) is enough for
 * `TransactionBuilder` — it only needs `accountId`/`sequenceNumber`/
 * `incrementSequenceNumber`, all of which `Account` implements. `balances`
 * is attached separately since only `Horizon.AccountResponse` has it. */
function fakeAccount(publicKey: string, balances: Array<Record<string, unknown>>) {
  return Object.assign(new Account(publicKey, "100"), { balances });
}

describe("ensureTrustline", () => {
  it("returns already_trusted without submitting a transaction when the trustline exists", async () => {
    const keypair = Keypair.random();
    const account = fakeAccount(keypair.publicKey(), [
      { asset_type: "credit_alphanum4", asset_code: ASSET_CODE, asset_issuer: ASSET_ISSUER },
    ]);
    const submitTransaction = vi.fn();
    const horizon = { loadAccount: vi.fn(async () => account), submitTransaction };

    const result = await ensureTrustline(
      {
        deviceSecret: keypair.secret(),
        networkPassphrase: NETWORK_PASSPHRASE,
        horizonUrl: "https://horizon-testnet.stellar.org",
        assetCode: ASSET_CODE,
        assetIssuer: ASSET_ISSUER,
      },
      horizon,
    );

    expect(result).toBe("already_trusted");
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("ignores balances for a different asset and still establishes the trustline", async () => {
    const keypair = Keypair.random();
    const account = fakeAccount(keypair.publicKey(), [
      { asset_type: "native" },
      { asset_type: "credit_alphanum4", asset_code: "OTHER", asset_issuer: Keypair.random().publicKey() },
    ]);
    const submitTransaction = vi.fn(async () => ({ successful: true }));
    const horizon = { loadAccount: vi.fn(async () => account), submitTransaction };

    const result = await ensureTrustline(
      {
        deviceSecret: keypair.secret(),
        networkPassphrase: NETWORK_PASSPHRASE,
        horizonUrl: "https://horizon-testnet.stellar.org",
        assetCode: ASSET_CODE,
        assetIssuer: ASSET_ISSUER,
      },
      horizon,
    );

    expect(result).toBe("established");
    expect(submitTransaction).toHaveBeenCalledTimes(1);
    // The submitted envelope should be signed by the device's own key.
    const submittedTx = submitTransaction.mock.calls[0][0];
    expect(submittedTx.signatures.length).toBeGreaterThan(0);
  });

  it("establishes the trustline when the account has no balances at all", async () => {
    const keypair = Keypair.random();
    const account = fakeAccount(keypair.publicKey(), []);
    const submitTransaction = vi.fn(async () => ({ successful: true }));
    const horizon = { loadAccount: vi.fn(async () => account), submitTransaction };

    const result = await ensureTrustline(
      {
        deviceSecret: keypair.secret(),
        networkPassphrase: NETWORK_PASSPHRASE,
        horizonUrl: "https://horizon-testnet.stellar.org",
        assetCode: ASSET_CODE,
        assetIssuer: ASSET_ISSUER,
      },
      horizon,
    );

    expect(result).toBe("established");
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });
});
