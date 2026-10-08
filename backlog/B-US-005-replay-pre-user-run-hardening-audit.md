# B-US-005 — Replay pre-user-run hardening audit

## Backlog metadata

- Status: `Needs fresh-main review`
- Priority: `Unprioritized`
- Blocking: `No`

> This item is preserved from the previous backlog. Later execution on `main` appears to have completed Replay hardening under task `9.6`; `B-US-007` must reconcile this item against fresh `main` before any new implementation is authorized.

## Goal

Perform an independent, uncompromising audit of the complete Market Recording + Replay implementation so defects are found in repository/CI proof before relying on a user's target-machine Replay run.

## Required audit

### Full static review

Read the complete Replay implementation and every materially affected generic seam, including:

```text
validated acquisition/recording seam
Recorder + IndexedDB store/library
portable export/parser/file source
Player scheduling/rebase/generation cancellation
ProducerBridge composition
Replay UI/coordinator/client
Replay Host lifecycle/security/ownership
service --db/--port/--allowed-origin seams
Current / History / Scanner / Demo Buy behavior used by Replay
build/launcher/docs/diagnostics
```

Check contracts against implementation line-by-line where material, including error paths, ownership/cleanup races, stale callbacks, restart/seek/stop transitions, malformed inputs, missing history, timestamp invariants, privacy and normal-live isolation.

### Executable proof

Run/review the focused Replay unit/service/browser coverage, `npm run test:acceptance:replay`, materially affected broad gates, build/launcher drift proof, middle-frame/zero-preroll, next-day rebasing, lifecycle semantics, Host security/isolation, progressive product behavior, malformed portable files, storage/quota boundaries and stale-generation/ACK races.

Where current tests do not prove a material risk discovered by static review, add the smallest regression/proof test instead of merely documenting the gap.

## Defect rule

Any defect found belongs to the executing work unit through:

```text
root cause
→ smallest correct fix
→ regression proof
→ affected verification
→ green
```

## Completion evidence

- Durable audit record mapping Replay contracts/components to reviewed code and green proof.
- No known untested material Replay risk remains within scope.
- Focused Replay acceptance plus required broad verification is green on one exact runtime candidate.
- Diff/review confirms no replay-aware shared server/protocol behavior and no live-DB ownership regression.
- Candidate is merged, required `main` CI is green, and open-PR state is clean.
