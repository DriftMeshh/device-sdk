export interface RunArgs {
  command: "run";
  /** Submit a single reading and exit, instead of running the interval loop. */
  once: boolean;
  /** Print epoch_zero/epoch_seconds/current epoch and exit without submitting anything. */
  diagnoseEpoch: boolean;
  /** When set, used directly as the epoch for submit_reading instead of computing it from the clock. */
  epochOverride?: number;
}

export interface ClaimArgs {
  command: "claim";
  /** When unset, index.ts claims the most recently finalized epoch (currentEpoch() - 1). */
  epoch?: number;
}

export interface DeactivateArgs {
  command: "deactivate";
}

export interface SetupKeychainArgs {
  command: "setup-keychain";
}

export type CliArgs = RunArgs | ClaimArgs | DeactivateArgs | SetupKeychainArgs;

function parseEpochFlag(argv: string[]): number | undefined {
  const epochFlagIndex = argv.indexOf("--epoch");
  if (epochFlagIndex === -1) return undefined;

  const raw = argv[epochFlagIndex + 1];
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--epoch requires a non-negative integer argument, got: ${raw ?? "(none)"}`);
  }
  return parsed;
}

/**
 * Parses device-sdk's CLI arguments. Kept separate from index.ts (a
 * top-level script with side effects on import/execution) so this logic
 * can be unit tested in isolation.
 *
 * A leading `claim`, `deactivate`, or `setup-keychain` positional
 * argument switches to that one-shot command; anything else is parsed as
 * flags for the normal continuous-submission run mode, unchanged from
 * before any of them was added.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  if (argv[0] === "claim") {
    return { command: "claim", epoch: parseEpochFlag(argv.slice(1)) };
  }
  if (argv[0] === "deactivate") {
    return { command: "deactivate" };
  }
  if (argv[0] === "setup-keychain") {
    return { command: "setup-keychain" };
  }

  return {
    command: "run",
    once: argv.includes("--once"),
    diagnoseEpoch: argv.includes("--diagnose-epoch"),
    epochOverride: parseEpochFlag(argv),
  };
}
