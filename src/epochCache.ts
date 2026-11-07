import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_CACHE_PATH = "./data/epoch-zero-cache.json";

/** Keyed by submission-validator contract ID, so switching contracts (a
 * redeploy, or pointing at a different deployment) naturally invalidates
 * the old entry instead of serving a stale epoch_zero for the wrong
 * contract. */
type EpochZeroCache = Record<string, number>;

export interface EpochZeroCacheOptions {
  path?: string;
}

function readCache(path: string): EpochZeroCache {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as EpochZeroCache;
  } catch {
    // A corrupt/partially-written cache file shouldn't block startup — the
    // caller just falls back to a fresh RPC fetch, same as a cache miss.
    return {};
  }
}

/** Reads a cached epoch_zero for the given contract ID, or `undefined` on a cache miss. */
export function getCachedEpochZero(
  contractId: string,
  opts: EpochZeroCacheOptions = {},
): number | undefined {
  return readCache(opts.path ?? DEFAULT_CACHE_PATH)[contractId];
}

/** Persists epoch_zero for the given contract ID, skipping the RPC round-trip in
 * `DriftMeshDevice.fetchEpochZero` on the next startup. */
export function setCachedEpochZero(
  contractId: string,
  epochZero: number,
  opts: EpochZeroCacheOptions = {},
): void {
  const path = opts.path ?? DEFAULT_CACHE_PATH;
  const cache = readCache(path);
  cache[contractId] = epochZero;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}
