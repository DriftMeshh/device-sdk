# DriftMesh — Device SDK

A client library + reading simulator for DriftMesh sensors. Signs and
submits readings to the deployed `device-registry` and
`submission-validator` contracts — this is what a real sensor (or, for
now, this simulator standing in for one) runs continuously.

## Why typed bindings instead of hand-written contract calls

`bindings/device-registry` and `bindings/submission-validator` are
generated directly from the contracts' own on-chain spec via:

```bash
stellar contract bindings typescript --wasm <path-to-wasm> --output-dir bindings/<name>
```

This means the method signatures, argument types, and even the
contracts' own doc comments are pulled straight from the Rust source —
if a contract's interface changes, regenerating these bindings surfaces
a compile error here instead of a silent runtime mismatch. `src/client.ts`
wraps both generated clients with the device's own signing key
(`basicNodeSigner`, the SDK's standard Node-environment signer).

## Running it

```bash
npm install
npm run build        # builds the bindings packages, then src/
cp .env.example .env
# fill in DEVICE_SECRET (the device's own keypair), OWNER_PUBLIC_KEY, and
# the two contract IDs — see contracts/TESTNET.md for already-deployed
# testnet IDs, or deploy your own via the contracts repo.
node --env-file=.env dist/index.js
```

It registers the device (skipping if already active — safe to restart),
then submits a simulated reading every `SUBMIT_INTERVAL_MS`, logging
whether each one was accepted.

```bash
npm test          # 14 tests: region bucketing + reading simulation
npm run typecheck
```

## Verified against the live testnet deployment

Not just unit-tested — actually run against the real contracts. From
`contracts/TESTNET.md`'s `dm_device` identity:

```
[device-sdk] device address: GCP747...IC7HTRT
[device-sdk] registration: already_active
[device-sdk] region_code=85656612, submitting every 60000ms (epoch window = 3600s)
[device-sdk] epoch=498111 value=2034 accepted=true
```

Then confirmed two ways:
- On-chain directly: `submission-validator.get_submission_count` for that
  device/epoch matched.
- Through `indexer`: with the indexer already polling, `GET
  /devices/:address/readings` returned the exact reading (same value,
  region code, and transaction hash) within one poll cycle — proving the
  full chain (`device-sdk` → live contract → `indexer` → REST API) works
  together, not just each piece in isolation.

## How `region_code` works

`src/region.ts` buckets a device's lat/lon into a coarse grid cell —
devices and the indexer need to agree on this scheme since it's what
`submission-validator` groups readings by for outlier comparison. It's
deliberately simple (pack a 16-bit lat index and 16-bit lon index into
one u32) rather than a real geohash; see the Wave issues below.

## Known limitations

- **No real hardware yet.** `src/simulate.ts` generates plausible values
  via a bounded random walk, standing in for an actual sensor. Swapping
  in real hardware means replacing `ReadingSimulator` with whatever reads
  the physical device, not changing `client.ts` or the contract calls.
- **Epoch window is a convention, not enforced on-chain.** `EPOCH_SECONDS`
  just needs to match what `payment-streamer` payouts are computed
  against — nothing stops a misconfigured device from submitting into the
  wrong epoch bucket. A real deployment would want to publish this value
  somewhere devices can read it rather than hardcoding it per-device.
- **Region bucketing is coarse and not geohash-compatible** — see above.

## Suggested Stellar Wave issues

**Trivial**
- Add a `--once` flag to `index.ts` for a single submission instead of only continuous polling
- Log a warning if a submitted reading was rejected N times in a row (possible miscalibrated sensor)

**Medium**
- Replace the ad hoc region-bucketing scheme with a real geohash, interoperable with standard geohash libraries/precision levels
- Add a `deactivate` CLI command wrapping `device-registry.deactivate_device`
- Support loading `DEVICE_SECRET` from an OS keychain instead of a plaintext `.env`

**High**
- Build a real hardware integration (e.g. a Raspberry Pi + an actual temperature/air-quality sensor) replacing `ReadingSimulator`
- Add retry/backoff for transient RPC failures during `signAndSend`, rather than only logging and waiting for the next tick
