export interface CliArgs {
  /** Submit a single reading and exit, instead of running the interval loop. */
  once: boolean;
  /** Print epoch_zero/epoch_seconds/current epoch and exit without submitting anything. */
  diagnoseEpoch: boolean;
  /** When set, used directly as the epoch for submit_reading instead of computing it from the clock. */
  epochOverride?: number;
}

/**
 * Parses device-sdk's CLI flags. Kept separate from index.ts (a top-level
 * script with side effects on import/execution) so this logic can be unit
 * tested in isolation.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const once = argv.includes("--once");
  const diagnoseEpoch = argv.includes("--diagnose-epoch");

  const epochFlagIndex = argv.indexOf("--epoch");
  let epochOverride: number | undefined;
  if (epochFlagIndex !== -1) {
    const raw = argv[epochFlagIndex + 1];
    const parsed = raw === undefined ? NaN : Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`--epoch requires a non-negative integer argument, got: ${raw ?? "(none)"}`);
    }
    epochOverride = parsed;
  }

  return { once, diagnoseEpoch, epochOverride };
}
