# Market Flow US — Local Fake Leumi acceptance

This is the deterministic local acceptance surface for TREE `7.2` and the first part of final target-machine acceptance. It uses the normal Market Flow US browser runtime, Recorder, loopback WebSocket service and real DuckDB against the synthetic `ScreenerHulPaging3` Fake Market. It does not require provider authentication or credentials.

Do not confuse the local `static` scenario with authenticated closed/static-provider verification. The local scenario proves deterministic product behavior against Fake Market; authenticated compatibility is documented separately in `docs/LIVE_VERIFICATION.md`.

## Default bounded acceptance

On Windows:

```text
RUN_LOCAL_ACCEPTANCE.cmd
```

Equivalent npm command:

```text
npm run test:acceptance:local
```

The default run executes `FR-7` and then the four `FR-8` sub-checkpoints sequentially. It stops immediately at the first failing checkpoint; an all-green run reaches all five checks. Its JSON report contains a separate PASS/FAIL row for every attempted sub-checkpoint so a failure is not collapsed into one opaque recovery result.

## FR-7 — repeated identical complete responses

```text
RUN_LOCAL_ACCEPTANCE.cmd static
```

Equivalent:

```text
npm run test:acceptance:local:static
```

Report:

```text
test-results/acceptance/static.json
```

This proves that repeated identical **synthetic** complete responses remain valid committed history without false universe revisions.

## FR-8A — moving values

Proves that a later synthetic provider value reaches Current while the prior committed value remains in History.

```text
RUN_LOCAL_ACCEPTANCE.cmd moving
```

Equivalent:

```text
npm run test:acceptance:local:moving
```

Report:

```text
test-results/acceptance/moving.json
```

## FR-8B — add/remove membership

Proves that membership changes receive a new universe revision and the complete cycle commits under the acknowledged revision.

```text
RUN_LOCAL_ACCEPTANCE.cmd membership
```

Equivalent:

```text
npm run test:acceptance:local:membership
```

Report:

```text
test-results/acceptance/membership.json
```

## FR-8C — provider failure and recovery

Proves deterministic provider failure recording, fail-closed behavior, normal recovery/commit and Scanner availability after recovery.

```text
RUN_LOCAL_ACCEPTANCE.cmd provider-recovery
```

Equivalent:

```text
npm run test:acceptance:local:provider-recovery
```

Report:

```text
test-results/acceptance/provider-recovery.json
```

## FR-8D — service restart

Proves that committed DuckDB authority survives service restart and collection can resume through the normal runtime relaunch path.

```text
RUN_LOCAL_ACCEPTANCE.cmd restart
```

Equivalent:

```text
npm run test:acceptance:local:restart
```

Report:

```text
test-results/acceptance/restart.json
```

## FR-9 target-machine profiles

These are intentionally excluded from the default bounded acceptance and are authoritative only on the intended target machine.

Day-bounded isolated persistence/read/Scanner profile:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
```

Representative `4096 × 180` end-to-end target profile:

```text
RUN_LOCAL_ACCEPTANCE.cmd target
```

The `4096 × 180` profile represents 737,280 committed history rows and retains the target-machine five-minute acceptance ceiling defined by the technical/test contracts. GitHub-hosted CI timings are diagnostic only and do not substitute for this target-machine result.

The acceptance envelope is written under `test-results/acceptance/`. Detailed workload reports are written under `test-results/acceptance/details/` only when the workload runner actually produced them.

## New-day lifecycle in final acceptance

The production active DB is one trading day. Final target-machine acceptance must also prove the documented rollover operation:

```text
stop producer/service
→ NEW_TRADING_DAY.cmd
→ prior DB archived under data/archive/
→ fresh schema-v3 active market tables
→ saved Scanner queries preserved
```

`NEW_TRADING_DAY.cmd` is not part of the default bounded Local Fake Leumi run because it operates on the normal production DB path rather than the acceptance fixture DB. It must be exercised explicitly during TREE `7.4` target-machine acceptance.

## Final acceptance order

The intended final sequence is:

```text
Local Fake Leumi bounded modes
→ isolated day-bounded profiles
→ 4096 × 180 target-machine profile
→ new-day lifecycle proof
→ authenticated closed/static provider compatibility
→ authenticated market-open movement proof
```

A PASS at one layer does not imply a PASS at a later layer. In particular:

- local synthetic `static` PASS is not authenticated-provider proof;
- authenticated static PASS is not market-open movement proof;
- hosted CI timing is not target-machine performance authority.

## Evidence and safety

Every acceptance envelope records the candidate Git SHA when available, working-tree cleanliness, checkpoint/profile, duration and PASS/FAIL result. Diagnostics redact repository, home and temporary paths plus URLs and keep only a bounded tail. Generated reports remain under ignored `test-results/`; no credentials, cookies, browser sessions or authenticated provider dumps are required or stored by this local Fake Leumi acceptance path.
