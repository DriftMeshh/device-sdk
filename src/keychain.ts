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
