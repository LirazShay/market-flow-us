# Market Flow US — Local Fake Leumi acceptance

This is the deterministic local acceptance surface for TREE `7.2`. It uses the normal Market Flow US browser runtime, Recorder, loopback WebSocket service and real DuckDB against the synthetic `ScreenerHulPaging3` Fake Market. It does not require provider authentication or credentials.

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

## FR-8A — moving values

Proves that a later provider value reaches Current while the prior committed value remains in History.

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

These are intentionally excluded from the default bounded acceptance.

Day-bounded isolated persistence/read/Scanner profile:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
```

Representative `4096 × 180` target profile:

```text
RUN_LOCAL_ACCEPTANCE.cmd target
```

The acceptance envelope is written under `test-results/acceptance/`. Detailed workload reports are written under `test-results/acceptance/details/` only when the workload runner actually produced them.

## Evidence and safety

Every acceptance envelope records the candidate Git SHA when available, working-tree cleanliness, checkpoint/profile, duration and PASS/FAIL result. Diagnostics redact repository, home and temporary paths plus URLs and keep only a bounded tail. Generated reports remain under ignored `test-results/`; no credentials, cookies, browser sessions or authenticated provider dumps are required or stored by this local Fake Leumi acceptance path.
