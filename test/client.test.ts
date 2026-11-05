import { describe, expect, it, vi } from "vitest";
import type { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import { isTransientError, signAndSendWithRetry } from "../src/client.js";

/**
 * Minimal duck-typed stand-in for an `AssembledTransaction`. The retry helper
 * only calls `tx.signAndSend()`, so a mock with just that method is enough to
 * exercise the retry loop without a live RPC node.
 *
 * `outcomes` is a script of what each successive `signAndSend()` call should
 * do. The last outcome repeats if the loop keeps calling past the script
 * length, so an "always fail" test only needs a single outcome.
 */
interface Outcome {
  error?: Error;
  value?: unknown;
}

function scriptedTx(outcomes: Outcome[]): { signAndSend: ReturnType<typeof vi.fn> } {
  let i = 0;
  const signAndSend = vi.fn(async () => {
    const outcome = outcomes[Math.min(i, outcomes.length - 1)];
    i++;
    if (outcome?.error) throw outcome.error;
    return outcome?.value;
  });
  return { signAndSend };
}

// Cast the mock to the real type so the production code paths type-check.
function asTx(mock: { signAndSend: ReturnType<typeof vi.fn> }): AssembledTransaction<unknown> {
  return mock as unknown as AssembledTransaction<unknown>;
}

function transientError(message = "fetch failed"): Error {
  return new Error(message); // name "Error" => not in the non-retryable set
}

function namedError(name: string, message = name): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe("signAndSendWithRetry", () => {
  it("retries a transient failure and eventually succeeds", async () => {
    const sentinel = { ok: true };
    const tx = asTx(scriptedTx([{ error: transientError() }, { value: sentinel }]));
    const sleep = vi.fn(async () => {});

    const result = await signAndSendWithRetry(tx, { sleep });

    expect(result).toBe(sentinel);
    expect(tx.signAndSend).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    // first backoff (after attempt 1): base 500 * 2^0 = 500
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("does not retry a contract simulation error and fails immediately", async () => {
    const contractErr = namedError("SimulationFailedError", "Transaction simulation failed");
    const tx = asTx(scriptedTx([{ error: contractErr }]));
    const sleep = vi.fn(async () => {});

    await expect(signAndSendWithRetry(tx, { sleep })).rejects.toBe(contractErr);
    expect(tx.signAndSend).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry an auth error (NeedsMoreSignatures) and fails immediately", async () => {
    const authErr = namedError("NeedsMoreSignaturesError");
    const tx = asTx(scriptedTx([{ error: authErr }]));
    const sleep = vi.fn(async () => {});

    await expect(signAndSendWithRetry(tx, { sleep })).rejects.toBe(authErr);
    expect(tx.signAndSend).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after maxAttempts transient failures with exponential backoff", async () => {
    const tx = asTx(scriptedTx([{ error: transientError("timeout") }]));
    const sleep = vi.fn(async () => {});

    await expect(
      signAndSendWithRetry(tx, {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        sleep,
      }),
    ).rejects.toThrow("timeout");

    expect(tx.signAndSend).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    // backoff after attempt 1: 100 * 2^0 = 100; after attempt 2: 100 * 2^1 = 200
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("caps the backoff delay at maxDelayMs", async () => {
    const tx = asTx(scriptedTx([{ error: transientError() }]));
    const sleep = vi.fn(async () => {});

    await expect(
      signAndSendWithRetry(tx, {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 4000,
        sleep,
      }),
    ).rejects.toThrow();

    // attempt1 -> 1000, attempt2 -> 2000, attempt3 -> 4000 (capped; 2^2=4*1000=4000)
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
    expect(sleep).toHaveBeenNthCalledWith(3, 4000);
  });

  it("honours a custom transient-error classifier", async () => {
    // Make *everything* non-transient: even a "transient" error should not retry.
    const tx = asTx(scriptedTx([{ error: transientError() }]));
    const sleep = vi.fn(async () => {});

    await expect(
      signAndSendWithRetry(tx, { isTransientError: () => false, sleep }),
    ).rejects.toThrow();

    expect(tx.signAndSend).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("succeeds on the first try without sleeping", async () => {
    const sentinel = { ok: true };
    const tx = asTx(scriptedTx([{ value: sentinel }]));
    const sleep = vi.fn(async () => {});

    const result = await signAndSendWithRetry(tx, { sleep });

    expect(result).toBe(sentinel);
    expect(tx.signAndSend).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("isTransientError", () => {
  it("treats generic / unknown errors as transient", () => {
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(namedError("ExternalServiceError", "rpc down"))).toBe(true);
    expect(isTransientError(namedError("TypeError", "network error"))).toBe(true);
  });

  it("treats contract / auth / wallet errors as non-transient", () => {
    expect(isTransientError(namedError("SimulationFailedError"))).toBe(false);
    expect(isTransientError(namedError("NeedsMoreSignaturesError"))).toBe(false);
    expect(isTransientError(namedError("UserRejectedError"))).toBe(false);
    expect(isTransientError(namedError("InvalidClientRequestError"))).toBe(false);
    expect(isTransientError(namedError("InternalWalletError"))).toBe(false);
    expect(isTransientError(namedError("ExpiredStateError"))).toBe(false);
    expect(isTransientError(namedError("RestoreFailureError"))).toBe(false);
    expect(isTransientError(namedError("NoSignerError"))).toBe(false);
  });

  it("returns false for nullish inputs", () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});
