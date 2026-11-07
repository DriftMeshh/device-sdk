import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCachedEpochZero, setCachedEpochZero } from "../src/epochCache.js";

describe("epochCache", () => {
  let dir: string;
  let cachePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "device-sdk-epoch-cache-"));
    cachePath = join(dir, "epoch-zero-cache.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined for a contract ID that's never been cached", () => {
    expect(getCachedEpochZero("CSOMECONTRACT", { path: cachePath })).toBeUndefined();
  });

  it("round-trips a cached value for a contract ID", () => {
    setCachedEpochZero("CVALIDATOR1", 1_700_000_000, { path: cachePath });
    expect(getCachedEpochZero("CVALIDATOR1", { path: cachePath })).toBe(1_700_000_000);
  });

  it("keys the cache per contract ID — a different contract ID is still a miss", () => {
    setCachedEpochZero("CVALIDATOR1", 1_700_000_000, { path: cachePath });
    expect(getCachedEpochZero("CVALIDATOR2", { path: cachePath })).toBeUndefined();
  });

  it("overwrites a stale value for the same contract ID", () => {
    setCachedEpochZero("CVALIDATOR1", 1_700_000_000, { path: cachePath });
    setCachedEpochZero("CVALIDATOR1", 1_800_000_000, { path: cachePath });
    expect(getCachedEpochZero("CVALIDATOR1", { path: cachePath })).toBe(1_800_000_000);
  });

  it("preserves other contracts' entries when adding a new one", () => {
    setCachedEpochZero("CVALIDATOR1", 1_700_000_000, { path: cachePath });
    setCachedEpochZero("CVALIDATOR2", 1_800_000_000, { path: cachePath });
    expect(getCachedEpochZero("CVALIDATOR1", { path: cachePath })).toBe(1_700_000_000);
    expect(getCachedEpochZero("CVALIDATOR2", { path: cachePath })).toBe(1_800_000_000);
  });

  it("creates the parent directory if it doesn't exist", () => {
    const nestedPath = join(dir, "nested", "deeper", "epoch-zero-cache.json");
    setCachedEpochZero("CVALIDATOR1", 1_700_000_000, { path: nestedPath });
    expect(getCachedEpochZero("CVALIDATOR1", { path: nestedPath })).toBe(1_700_000_000);
  });

  it("treats a corrupt cache file as empty rather than throwing", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath, "{ not valid json");
    expect(getCachedEpochZero("CVALIDATOR1", { path: cachePath })).toBeUndefined();
  });
});
