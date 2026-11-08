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
# fill in the two contract IDs — see contracts/TESTNET.md for
# already-deployed testnet IDs, or deploy your own via the contracts repo.
node --env-file=.env dist/index.js
```

It registers the device (skipping if already active — safe to restart),
then submits a simulated reading every `SUBMIT_INTERVAL_MS`, logging
whether each one was accepted.

`DEVICE_SECRET` and `OWNER_PUBLIC_KEY` are optional — leave them unset
and `src/identity.ts` auto-provisions a device: generates a keypair,
funds it via testnet Friendbot, and persists it to
`./data/device-identity.json` so a restart reuses the same device
instead of registering a new one each time (the device then owns
itself). This is what lets it run as a zero-config background worker —
see Deploying below.

Pass `--once` to submit exactly one reading and exit immediately — useful
for testing, demos, or cron-driven deployments where the device wakes up,
submits, and sleeps rather than staying resident:

```bash
node --env-file=.env dist/index.js --once
```

Pass `--epoch <n>` to submit against a specific epoch number instead of
the one computed from the current clock — useful for manually exercising
an epoch during testing:

```bash
node --env-file=.env dist/index.js --once --epoch 7
```

Pass `--diagnose-epoch` to print `epoch_zero`/`epoch_seconds`/the current
computed epoch and exit immediately, without registering the device or
submitting anything — a quick sanity check when something about epoch
timing looks wrong:

```bash
node --env-file=.env dist/index.js --diagnose-epoch
# [device-sdk] epoch_zero=1793976171 epoch_seconds=3600 now=1794055682 current_epoch=22
```

```bash
npm test          # region bucketing, reading simulation, CLI parsing, trustline handling
npm run typecheck
```

### Running it with Docker

A standalone multi-stage `Dockerfile` is included, independent of how
`indexer`'s Bot-Hosting setup bundles device-sdk as a subdirectory:

```bash
docker build -t driftmesh-device-sdk .
docker run --rm \
  -e DEVICE_REGISTRY_CONTRACT_ID=<id> \
  -e SUBMISSION_VALIDATOR_CONTRACT_ID=<id> \
  driftmesh-device-sdk
```

All configuration is passed as environment variables at `docker run` time
(see `.env.example` for the full list) — no `.env` file is baked into the
image. `DEVICE_SECRET`/`OWNER_PUBLIC_KEY` left unset still auto-provisions
a device identity as described above, but note that without a mounted
volume for `./data`, a fresh container gets a fresh identity every run —
mount a volume (`-v devicesdk-data:/app/data`) if you want the same
device to persist across container restarts.

### Reward asset trustline

A device needs a classic-Stellar trustline to the reward asset before
`payment-streamer.claim()` can pay it out — otherwise the claim fails
with an opaque "trustline entry is missing for account" error from the
token contract, not from device-sdk. Set `REWARD_ASSET_CODE` and
`REWARD_ASSET_ISSUER` (see `.env.example`) and device-sdk checks for the
trustline on every startup via Horizon, establishing it automatically if
missing. Leave both unset to skip this check entirely (e.g. if claiming
is handled by some other process that already manages trustlines).

### Claiming a payout

With `PAYMENT_STREAMER_CONTRACT_ID` set, claim this device's share of a
finalized epoch's reward pool:

```bash
node --env-file=.env dist/index.js claim
# [device-sdk] claimed epoch=21 payout=526315789
```

Without `--epoch`, claims the most recently finalized epoch
(`currentEpoch() - 1` — the current epoch is by definition still open).
Pass `--epoch <n>` to claim a specific one instead:

```bash
node --env-file=.env dist/index.js claim --epoch 7
```

Claiming an epoch that hasn't finalized yet, or that this device has
already claimed, fails with the contract's own error (`EpochNotFinal`,
`AlreadyClaimed`, etc.) — see `contracts/payment-streamer`'s README for
the full error list.

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

## Deploying

For the live demo this runs continuously as a background worker
alongside `indexer`, so the dashboard always shows moving data instead
of a static snapshot — bundled into **the same** [Bot-Hosting.net](https://bot-hosting.net)
deployment as `indexer` (not a separate one), since the free plan caps
out at one deployment per account. Verified live as of November 2026:
the indexer's deployment Start command clones this repo alongside its
own, builds it, and launches it as a background process before
`exec`ing into the indexer's own process:

```bash
cd /home/container && \
  if [ -f package.json ]; then npm install --no-fund --no-audit && npm run build; fi && \
  if [ -d device-sdk/.git ]; then (cd device-sdk && git pull --ff-only); else \
    git clone --depth 1 https://github.com/DriftMeshh/device-sdk.git device-sdk; fi && \
  (cd device-sdk && npm install --no-fund --no-audit && npm run build && node dist/index.js &) && \
  exec node ${STARTUP_FILE}
```

The indexer's own env vars already cover `STELLAR_RPC_URL`,
`NETWORK_PASSPHRASE`, and `DEVICE_REGISTRY_CONTRACT_ID` /
`SUBMISSION_VALIDATOR_CONTRACT_ID` — only `DEVICE_TYPE`, `LAT`, `LON`,
and `SUBMIT_INTERVAL_MS` need adding on top. `DEVICE_SECRET` is
deliberately left unset so it self-provisions (see above); the
generated identity persists to `device-sdk/data/device-identity.json`
in the container's own storage, surviving restarts but not a fresh
redeploy. If you have your own separate host (or a paid Bot-Hosting
plan removing the 1-deployment cap), this runs as its own standalone
deployment just as easily — the bundling above is a free-tier
workaround, not a requirement.

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
- Log a warning if a submitted reading was rejected N times in a row (possible miscalibrated sensor)

**Medium**
- Replace the ad hoc region-bucketing scheme with a real geohash, interoperable with standard geohash libraries/precision levels
- Add a `deactivate` CLI command wrapping `device-registry.deactivate_device`
- Support loading `DEVICE_SECRET` from an OS keychain instead of a plaintext `.env`

**High**
- Build a real hardware integration (e.g. a Raspberry Pi + an actual temperature/air-quality sensor) replacing `ReadingSimulator`
- Add retry/backoff for transient RPC failures during `signAndSend`, rather than only logging and waiting for the next tick
