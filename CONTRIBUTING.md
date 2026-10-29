# Contributing to DriftMesh — device-sdk

This repo is scoped for [Stellar Wave](https://www.drips.network/wave/stellar) —
issue complexity here follows Wave's own point system.

## Before you start

1. Read the [README](README.md) — especially "Known limitations" so you
   know what's a deliberate v1 scope cut (e.g. the reading simulator
   standing in for real hardware) versus an actual bug.
2. Set up and confirm the existing suite passes:

   ```bash
   npm install
   npm run build
   npm test          # 14 tests should pass
   npm run typecheck
   ```

## Issue complexity (matches Stellar Wave's point system exactly)

| Tier | Points | What belongs here |
|---|---|---|
| Trivial | 100 | A `--once` CLI flag, a warning log for repeated rejections. |
| Medium | 150 | A real geohash implementation replacing `region.ts`'s ad hoc bucketing, a `deactivate` CLI command. |
| High | 200 | An actual hardware integration replacing `ReadingSimulator`, retry/backoff for `signAndSend` failures. |

See the README's "Suggested Stellar Wave issues" section for concrete,
already-scoped examples at each tier.

## What a good PR looks like here

- **Regenerate bindings, don't hand-edit them.** `bindings/device-registry`
  and `bindings/submission-validator` are generated via
  `stellar contract bindings typescript` from the `contracts` repo's
  wasm — see the README's "Why typed bindings" section. If a contract
  interface changed, regenerate; don't patch the generated `src/index.ts`
  by hand.
- **`region.ts` and `simulate.ts` are pure functions with no I/O** —
  keep it that way. They're the two files with real unit test coverage
  specifically because they're deterministic; a change that pulls in
  network or filesystem access there will be harder to test and should
  live in `client.ts` or `index.ts` instead.
- **If you touch `client.ts`, test it against real testnet, not just
  the type checker.** Signing/submission logic is exactly the kind of
  code that type-checks fine and still fails at runtime — the README's
  "Verified against the live testnet deployment" section shows the
  actual commands used the first time; follow the same pattern.
- **PR description includes `Closes #<issue>`.**

## A note on scope

Device registration happens here, through a device's own keypair — not
through a human's browser wallet (that's `app`'s territory, and
deliberately so; see `app`'s README "Wallet integration" section for why
Claim/Subscribe live there but Register doesn't). Keep that separation
in mind if your issue touches identity/signing.
