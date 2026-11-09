import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  detectKeychainPlatform,
  readSecretFromKeychain,
  writeSecretToKeychain,
  runCommand,
} from "../src/keychain.js";

describe("detectKeychainPlatform", () => {
  it("maps darwin to darwin", () => {
    expect(detectKeychainPlatform("darwin")).toBe("darwin");
  });

  it("maps linux to linux", () => {
    expect(detectKeychainPlatform("linux")).toBe("linux");
  });

  it("maps everything else to unsupported", () => {
    expect(detectKeychainPlatform("win32")).toBe("unsupported");
    expect(detectKeychainPlatform("freebsd")).toBe("unsupported");
  });
});

describe("readSecretFromKeychain", () => {
  it("looks up via `security find-generic-password` on darwin", async () => {
    const run = vi.fn(async () => ({ stdout: "my-secret\n", stderr: "" }));
    const secret = await readSecretFromKeychain("acct", "darwin", run);
    expect(secret).toBe("my-secret");
    expect(run).toHaveBeenCalledWith("security", [
      "find-generic-password",
      "-a",
      "acct",
      "-s",
      "driftmesh-device-sdk",
      "-w",
    ]);
  });

  it("looks up via `secret-tool lookup` on linux", async () => {
    const run = vi.fn(async () => ({ stdout: "my-secret\n", stderr: "" }));
    const secret = await readSecretFromKeychain("acct", "linux", run);
    expect(secret).toBe("my-secret");
    expect(run).toHaveBeenCalledWith("secret-tool", [
      "lookup",
      "service",
      "driftmesh-device-sdk",
      "account",
      "acct",
    ]);
  });

  it("returns undefined immediately on an unsupported platform, without calling run", async () => {
    const run = vi.fn();
    expect(await readSecretFromKeychain("acct", "unsupported", run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it("returns undefined when the command fails (not found / tool missing)", async () => {
    const run = vi.fn(async () => {
      throw new Error("No such keychain item");
    });
    expect(await readSecretFromKeychain("acct", "darwin", run)).toBeUndefined();
  });

  it("returns undefined for an empty stored value rather than an empty string", async () => {
    const run = vi.fn(async () => ({ stdout: "\n", stderr: "" }));
    expect(await readSecretFromKeychain("acct", "linux", run)).toBeUndefined();
  });
});

describe("writeSecretToKeychain", () => {
  it("stores via `security add-generic-password` on darwin", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    await writeSecretToKeychain("acct", "s3cr3t", "darwin", run);
    expect(run).toHaveBeenCalledWith("security", [
      "add-generic-password",
      "-a",
      "acct",
      "-s",
      "driftmesh-device-sdk",
      "-w",
      "s3cr3t",
      "-U",
    ]);
  });

  it("stores via `secret-tool store` on linux, piping the secret through stdin", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "" }));
    await writeSecretToKeychain("acct", "s3cr3t", "linux", run);
    expect(run).toHaveBeenCalledWith(
      "secret-tool",
      ["store", "--label", "driftmesh-device-sdk (acct)", "service", "driftmesh-device-sdk", "account", "acct"],
      "s3cr3t",
    );
  });

  it("throws clearly on an unsupported platform instead of attempting anything", async () => {
    const run = vi.fn();
    await expect(writeSecretToKeychain("acct", "s3cr3t", "unsupported", run)).rejects.toThrow(
      /not supported/,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("propagates a failure from the underlying command (a write failing should be loud)", async () => {
    const run = vi.fn(async () => {
      throw new Error("permission denied");
    });
    await expect(writeSecretToKeychain("acct", "s3cr3t", "darwin", run)).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("runCommand", () => {
  function fakeChild() {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: vi.fn(), end: vi.fn() };
    return child;
  }

  it("resolves with collected stdout/stderr on a zero exit code", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child as never);
    const promise = runCommand("echo", ["hi"], undefined, spawnFn);
    child.stdout.emit("data", "hello");
    child.emit("close", 0);
    await expect(promise).resolves.toEqual({ stdout: "hello", stderr: "" });
  });

  it("rejects with stderr content on a non-zero exit code", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child as never);
    const promise = runCommand("false", [], undefined, spawnFn);
    child.stderr.emit("data", "boom");
    child.emit("close", 1);
    await expect(promise).rejects.toThrow(/exited with code 1.*boom/s);
  });

  it("writes stdin when provided, then ends it", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child as never);
    const promise = runCommand("cat", [], "piped-in", spawnFn);
    child.emit("close", 0);
    await promise;
    expect(child.stdin.write).toHaveBeenCalledWith("piped-in");
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it("rejects on a spawn error (e.g. the binary doesn't exist)", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child as never);
    const promise = runCommand("nonexistent-binary", [], undefined, spawnFn);
    child.emit("error", new Error("ENOENT"));
    await expect(promise).rejects.toThrow("ENOENT");
  });
});
