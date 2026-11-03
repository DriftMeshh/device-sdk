import { Keypair } from "@stellar/stellar-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_IDENTITY_PATH = "./data/device-identity.json";

export interface IdentityOptions {
  /** Where to persist a generated identity, so a restart reuses the same
   * device instead of registering a brand new one each time. */
  path?: string;
  /** Only funds via Friendbot when this is the testnet passphrase — never
   * attempted against a real network. */
  networkPassphrase: string;
}

/**
 * Resolves the device's signing key: an explicit secret wins; otherwise a
 * previously generated identity is reused from disk; otherwise a fresh
 * keypair is generated, funded via Stellar's public testnet Friendbot (so
 * it can pay its own fees), and persisted for next time. This is what
 * lets device-sdk run as a zero-config background worker — no secret has
 * to be created or handed to it up front.
 */
export async function resolveDeviceSecret(
  envSecret: string | undefined,
  opts: IdentityOptions,
): Promise<string> {
  if (envSecret) return envSecret;

  const path = opts.path ?? DEFAULT_IDENTITY_PATH;
  if (existsSync(path)) {
    const saved = JSON.parse(readFileSync(path, "utf8")) as { secret: string };
    return saved.secret;
  }

  const keypair = Keypair.random();
  const isTestnet = opts.networkPassphrase.includes("Test SDF Network");
  if (isTestnet) {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`);
    if (!res.ok) {
      throw new Error(
        `Friendbot funding failed for a freshly generated device identity (${res.status}). ` +
          `Set DEVICE_SECRET explicitly to skip auto-provisioning.`,
      );
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ secret: keypair.secret(), publicKey: keypair.publicKey() }, null, 2),
  );
  console.log(
    `[device-sdk] generated a new device identity ${keypair.publicKey()} (persisted to ${path})`,
  );
  return keypair.secret();
}
