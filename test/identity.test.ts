import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDeviceSecret } from "../src/identity.js";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

describe("resolveDeviceSecret", () => {
  let dir: string;
  let identityPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "device-sdk-identity-"));
    identityPath = join(dir, "device-identity.json");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an explicit secret unchanged, without touching disk or network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const secret = await resolveDeviceSecret("SSOME-EXPLICIT-SECRET", {
      path: identityPath,
      networkPassphrase: TESTNET_PASSPHRASE,
    });
    expect(secret).toBe("SSOME-EXPLICIT-SECRET");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(existsSync(identityPath)).toBe(false);
  });

  it("reuses a previously persisted identity instead of generating a new one", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(identityPath, JSON.stringify({ secret: "SPERSISTED", publicKey: "GPERSISTED" }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const secret = await resolveDeviceSecret(undefined, {
      path: identityPath,
      networkPassphrase: TESTNET_PASSPHRASE,
    });

    expect(secret).toBe("SPERSISTED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("generates and funds a fresh identity on testnet when none exists", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);

    const secret = await resolveDeviceSecret(undefined, {
      path: identityPath,
      networkPassphrase: TESTNET_PASSPHRASE,
    });

    expect(secret).toMatch(/^S[A-Z0-9]{55}$/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("friendbot.stellar.org");

    expect(existsSync(identityPath)).toBe(true);
    const saved = JSON.parse(readFileSync(identityPath, "utf8"));
    expect(saved.secret).toBe(secret);
  });

  it("skips Friendbot funding outside testnet", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const secret = await resolveDeviceSecret(undefined, {
      path: identityPath,
      networkPassphrase: PUBLIC_PASSPHRASE,
    });

    expect(secret).toMatch(/^S[A-Z0-9]{55}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(existsSync(identityPath)).toBe(true);
  });

  it("throws if Friendbot funding fails, without persisting a broken identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 400 } as Response);

    await expect(
      resolveDeviceSecret(undefined, { path: identityPath, networkPassphrase: TESTNET_PASSPHRASE }),
    ).rejects.toThrow(/Friendbot funding failed/);

    expect(existsSync(identityPath)).toBe(false);
  });
});
