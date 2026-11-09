import { spawn } from "node:child_process";

const SERVICE_NAME = "driftmesh-device-sdk";

export type KeychainPlatform = "darwin" | "linux" | "unsupported";

export function detectKeychainPlatform(platform: NodeJS.Platform = process.platform): KeychainPlatform {
  if (platform === "darwin") return "darwin";
  if (platform === "linux") return "linux";
  return "unsupported";
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs a command, optionally writing `stdin` to it, and resolves with its
 * collected stdout/stderr — rejects on a non-zero exit code or a spawn
 * error (e.g. the binary isn't installed). Exists as its own exported
 * function so tests can inject a fake in place of `spawn`, since the real
 * OS keychain tools (`security`, `secret-tool`) aren't available to run
 * in CI or in this project's own sandboxed dev environment.
 */
export function runCommand(
  cmd: string,
  args: string[],
  stdin?: string,
  spawnFn: typeof spawn = spawn,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
      }
    });
    if (stdin !== undefined) {
      child.stdin?.write(stdin);
    }
    child.stdin?.end();
  });
}

/**
 * Reads a secret from the OS keychain, if one is available for this
 * platform and an entry exists under `account`. Returns `undefined` on
 * *any* failure — not found, tool not installed, unsupported platform —
 * since this is always a fallback path: a failed keychain read should
 * fall through to `.env`/auto-provisioning, never crash startup.
 */
export async function readSecretFromKeychain(
  account: string,
  platform: KeychainPlatform = detectKeychainPlatform(),
  run: typeof runCommand = runCommand,
): Promise<string | undefined> {
  try {
    if (platform === "darwin") {
      const { stdout } = await run("security", [
        "find-generic-password",
        "-a",
        account,
        "-s",
        SERVICE_NAME,
        "-w",
      ]);
      const secret = stdout.trim();
      return secret || undefined;
    }
    if (platform === "linux") {
      const { stdout } = await run("secret-tool", ["lookup", "service", SERVICE_NAME, "account", account]);
      const secret = stdout.trim();
      return secret || undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes a secret to the OS keychain under `account` — the setup-time
 * half of the flow (see the `setup-keychain` CLI command): run this once
 * to store a secret, then leave `DEVICE_SECRET` unset with
 * `USE_OS_KEYCHAIN=true` so startup reads it back from here instead of
 * plaintext on every subsequent run. Unlike the read side, this throws
 * on failure — a write the caller explicitly asked for failing silently
 * would be far more confusing than a failed opportunistic read.
 */
export async function writeSecretToKeychain(
  account: string,
  secret: string,
  platform: KeychainPlatform = detectKeychainPlatform(),
  run: typeof runCommand = runCommand,
): Promise<void> {
  if (platform === "darwin") {
    // -U: update in place if an entry for this account/service already exists.
    await run("security", [
      "add-generic-password",
      "-a",
      account,
      "-s",
      SERVICE_NAME,
      "-w",
      secret,
      "-U",
    ]);
    return;
  }
  if (platform === "linux") {
    // secret-tool reads the secret to store from stdin, not argv — keeps
    // it out of the process list / shell history.
    await run(
      "secret-tool",
      ["store", "--label", `${SERVICE_NAME} (${account})`, "service", SERVICE_NAME, "account", account],
      secret,
    );
    return;
  }
  throw new Error(`OS keychain storage is not supported on this platform (${platform}).`);
}
