# Market Flow US — Local Fake Leumi acceptance

This is the deterministic local acceptance surface for the release path leading into TREE `7.4`. It uses the normal Market Flow US browser runtime, Recorder, loopback WebSocket service and real DuckDB against the synthetic `ScreenerHulPaging3` Fake Market, plus focused existing Demo Buy / AI Investigation proofs. It does not require provider authentication or credentials.

Do not confuse local `static` with authenticated closed/static-provider verification. Local acceptance proves deterministic product behavior against synthetic authority; authenticated compatibility is documented separately in `docs/LIVE_VERIFICATION.md`.

## Default bounded acceptance

On Windows:

```text
RUN_LOCAL_ACCEPTANCE.cmd
```

Equivalent npm command:

```text
npm run test:acceptance:local
```

The default run executes `FR-7`, `FR-8A` through `FR-8D`, and the post-feature `FR-8E` through `FR-8H` checks sequentially. It stops at the first failure. The JSON report contains a separate PASS/FAIL row for every attempted sub-checkpoint so failures remain diagnosable.

This is intentionally a bounded composition of already-reviewed focused tests, not a second giant matrix. Heavy `FR-9` profiles remain explicit target-machine runs.

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

This proves repeated identical complete synthetic responses remain valid committed history without false universe revisions.

## FR-8A — moving values

```text
RUN_LOCAL_ACCEPTANCE.cmd moving
```

Proves a later synthetic provider value reaches Current while the prior committed value remains in History.

## FR-8B — add/remove membership

```text
RUN_LOCAL_ACCEPTANCE.cmd membership
```

Proves membership changes receive a new universe revision and the complete cycle commits under the acknowledged revision.

## FR-8C — provider failure and recovery

```text
RUN_LOCAL_ACCEPTANCE.cmd provider-recovery
```

Proves deterministic provider failure recording, fail-closed behavior, normal recovery/commit and Scanner availability after recovery.

## FR-8D — service restart

```text
RUN_LOCAL_ACCEPTANCE.cmd restart
```

Proves committed DuckDB authority survives service restart and collection can resume through the normal runtime relaunch path.

## FR-8E — composed Demo Buy runtime

```text
RUN_LOCAL_ACCEPTANCE.cmd demo-buy-runtime
```

This runs the focused composed Fake Market → normal browser runtime → real service → real DuckDB Demo Buy test. It proves manual and Auto capture remain bound to exact Scanner generations, Scanner continues behind the Demo Buy screen, and recurring Stop/resume semantics remain intact.

## FR-8F — progressive outcomes and targeted refresh

```text
RUN_LOCAL_ACCEPTANCE.cmd demo-buy-outcomes
```

This runs the focused Chromium outcome-surface proof. It proves grouped progressive horizon evidence, Pending/unavailable presentation, continuation paging and targeted refresh of an older observation without resetting the loaded list.

## FR-8G — AI Investigation UI / result-position semantics

```text
RUN_LOCAL_ACCEPTANCE.cmd ai-investigation-ui
```

This focused Chromium proof covers both an unordered returned-position-1 result and an explicitly ordered returned-position-1 result. Position alone is described neutrally rather than as “best/top-ranked”. It also proves authority refresh before generation, one Viewer export slot, clipboard fallback and `PARTIAL_OUTCOME` → `COMPLETE_OUTCOME` regeneration.

## FR-8H — real-service AI pack safety and regeneration

```text
RUN_LOCAL_ACCEPTANCE.cmd ai-pack-safety
```

This focused Node/service/DuckDB proof creates a real Demo Buy capture and AI Investigation Pack, then regenerates it after later committed evidence reaches the ten-minute boundary. It verifies:

- collision-safe relative export paths;
- immutable exact `QUERY.sql` / capture provenance;
- sharing-safe market/context projection;
- no operational/session canary leakage in generated files, response metadata or diagnostics;
- `PARTIAL_OUTCOME` → `COMPLETE_OUTCOME` regeneration;
- no mutation of market or Demo Buy authority by export.

## Post-feature-only convenience profile

To re-run only `FR-8E` through `FR-8H`:

```text
RUN_LOCAL_ACCEPTANCE.cmd feature
```

Equivalent:

```text
npm run test:acceptance:local:feature
```

This is the preferred quick deterministic post-feature reclosure check after Fast/Browser focused work. The full release acceptance still uses the default `all` profile.

## Reports

Every selected profile writes:

```text
test-results/acceptance/<profile>.json
```

Composite reports include one row per attempted child checkpoint. Diagnostics redact repository, home and temporary paths plus URLs and keep only a bounded tail. Generated reports remain ignored local artifacts.

## FR-9 target-machine profiles

These are intentionally excluded from default bounded acceptance and become authoritative only on the intended target machine.

Day-bounded isolated persistence/read/Scanner/Demo Buy/AI profile:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
```

Representative `4096 × 180` end-to-end target profile:

```text
RUN_LOCAL_ACCEPTANCE.cmd target
```

The `4096 × 180` profile represents 737,280 committed history rows. GitHub-hosted timings are diagnostic only and do not substitute for target-machine evidence.

Detailed workload reports are written under `test-results/acceptance/details/` only when the workload runner actually produced them.

## New-day lifecycle in final acceptance

The production active DB is one trading day. Final target-machine acceptance must also prove the documented rollover operation:

```text
stop producer/service
→ NEW_TRADING_DAY.cmd
→ accept a valid stopped Market Flow US schema-v3 or schema-v4 source
→ prior DB archived under data/archive/
→ fresh schema-v4 active DB
→ saved Scanner queries preserved
→ empty Demo Buy capture/item state
```

The source archive is preserved unchanged when archival is requested. `NEW_TRADING_DAY.cmd` is not folded into the bounded Fake Market matrix because it operates on the normal production DB path; it is exercised explicitly during TREE `7.4` target-machine acceptance.

## Final acceptance order

The intended final sequence is:

```text
Local Fake Leumi bounded all profile
→ isolated day-bounded profile
→ 4096 × 180 target-machine profile
→ new-day lifecycle proof
→ authenticated closed/static provider compatibility
→ authenticated market-open movement proof
```

A PASS at one layer does not imply a PASS at a later layer. In particular:

- local synthetic `static` PASS is not authenticated-provider proof;
- post-feature AI pack PASS is not authenticated-provider proof;
- authenticated static PASS is not market-open movement proof;
- hosted CI timing is not target-machine performance authority.

## Evidence and safety

Every acceptance envelope records the candidate Git SHA when available, working-tree cleanliness, checkpoint/profile, duration and PASS/FAIL result. No credentials, cookies, browser sessions, account identifiers, private browser state or authenticated provider dumps are required or stored by this local Fake Leumi acceptance path.

The shareable AI Investigation Pack has a separate explicit projection. It keeps exact user-authored SQL verbatim and therefore must still be reviewed before external upload even though operational/session fields and arbitrary unsafe Scanner text are excluded/redacted by contract.
