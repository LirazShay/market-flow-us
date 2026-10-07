# Replay Pre-User-Run Hardening Contract

## Ownership

This document owns the verification/hardening mini-project requested after completed TREE `9.5` and before final target-machine acceptance.

It is **not** a new Replay feature. `docs/MARKET_REPLAY.md` remains the product/behavior contract. This document defines how the implemented Replay lane must be adversarially audited, repaired when evidence finds a real defect, and re-verified before the user's first serious target-machine run is relied upon.

The exact completed post-Branch-9 baseline entering this mini-project is:

```text
243f4f2e78e434378ff2202ba95af7b8626a0369
```

If hardening changes runtime/product code, that SHA becomes historical baseline evidence and the merged hardening SHA becomes the new Replay baseline. If no runtime/product correction is required, the audit may prove that the same runtime baseline remains valid while planning/audit evidence advances.

## 1. Goal

Before relying on the user's Replay run, establish that there is no **known material Replay defect or materially unproved Replay risk** in the implemented path.

The mini-project must do both:

```text
complete static/adversarial audit
+
executable proof over every material boundary
```

A green test suite by itself is not sufficient if static review finds an untested race/error path. Static review by itself is not sufficient if the behavior can be exercised deterministically.

## 2. Scope boundary

Audit the implemented Replay path end to end:

```text
validated ScreenerHulPaging3 snapshot boundary
→ recorder
→ IndexedDB recording store/library
→ portable export/parser/file source
→ recording-source abstraction / seek index
→ Market Player scheduler / time projection / generation cancellation
→ ProducerBridge / ACK flow
→ Replay UI / coordinator / client
→ Replay Host bootstrap / control / lifecycle
→ unchanged Market Flow US service --db / --port / --allowed-origin seams
→ replay-only DuckDB
→ Current / Detail-History / Scanner / Demo Buy behavior used during Replay
→ build / launcher / docs / diagnostics
```

The audit includes error paths, cleanup paths and restart paths, not only the happy path.

## 3. Non-goals

Do not add speculative Replay capability while hardening.

Still out of scope unless a discovered defect proves one is strictly required:

```text
playback speeds other than 1x
hidden preroll / fast-forward
server replayMode / virtual clock / seek/reset protocol
new replay persistence/database authority
cloud storage/sync
recording encryption/signing
strategy behavior changes unrelated to Replay correctness
```

Fix the smallest root cause that satisfies the existing Replay contract.

## 4. Mandatory static audit matrix

The executor must read the actual implementation/tests for each area below and record a concise durable audit result.

### 4.1 Recording boundary

Check:

- only complete validated snapshots become frames;
- membership/reorder behavior remains deterministic;
- provider/validation failure cannot commit a valid-looking partial frame;
- recording metadata contains no auth/session/account/private browser material;
- stop/failure cannot leave a recording falsely marked complete.

### 4.2 IndexedDB store/library

Check:

- create/append/stop/reopen/list/delete lifecycle;
- transaction failure and quota/storage failure behavior;
- prior committed frames survive later write failure;
- delete is explicit and bounded to the selected recording;
- stale async callbacks cannot mutate a newer recording generation.

### 4.3 Portable format / file source

Check:

- manifest/frame/footer/version/count/order agreement;
- malformed/truncated/unsupported/duplicate/out-of-order input fails closed;
- export streams rather than requiring one giant in-memory document;
- file playback does not require full IndexedDB import;
- seek index points only to real validated frame boundaries;
- parser/source cleanup cannot leak stale reads into a new source.

### 4.4 Player / time projection

Check:

- exact recorded irregular spacing at 1x;
- locally-owned timestamps rebase coherently while provider/source facts remain unchanged;
- Pause emits nothing and Resume preserves remaining delay in a new contemporary segment;
- Stop/Seek/new Play invalidates stale timers/promises/callbacks;
- ACK gating prevents overlapping authoritative emission;
- errors cannot accidentally advance position or emit a later frame.

### 4.5 Replay Host / lifecycle / security

Check:

- loopback-only control;
- exact allowed Origin;
- ephemeral one-run control credential;
- unauthorized/stale credential rejection before lifecycle mutation;
- Host controls only the child process and replay DB artifacts it owns;
- occupied/foreign port or ambiguous path fails closed;
- Stop→Play and Seek create fresh replay authority;
- normal live DB/process is never opened/reset/deleted/stopped by Replay;
- cleanup races cannot kill a later/new child generation.

### 4.6 Shared service/protocol boundary

Check that Replay has not leaked into shared authority:

```text
no replayMode
no virtual clock
no load-recording operation
no seek/reset operation
no hidden fast-forward/preroll
```

The unchanged service must continue receiving only normal producer messages.

### 4.7 Product surfaces over arbitrary Replay start

Check:

- Current works after the first emitted/committed frame;
- History contains only emitted frames;
- staged Scanner tolerates absent earlier anchors and gains them only as later frames arrive;
- Detail works for current/historical state actually present;
- Demo Buy baseline/future-horizon semantics use replayed authoritative cycles normally;
- missing earlier history is handled as generic live-start state, never synthesized by Replay.

### 4.8 Packaging / diagnostics / operator path

Check:

- `build:replay` and Replay launcher match current implementation;
- ordinary launch/test commands retain their existing semantics;
- diagnostics are bounded/public-safe and contain no credential/private recording material;
- errors identify the failing stage sufficiently for next-run diagnosis.

## 5. Mandatory executable proof

At minimum, hardening must run and keep green:

```text
npm run build:replay
npm run test:acceptance:replay
npm run test:unit
npm run test:service
```

It must also run the materially affected Browser/Planning/Workload/local-acceptance gates required by the files actually changed.

Focused proof must explicitly cover:

- middle-frame start with a fresh DB and zero preroll;
- next-day replay with contemporary local timing and unchanged provider/source values;
- Stop→Play fresh authority;
- Seek fresh authority;
- Pause/Resume same authority;
- stale Player generation/timer cancellation;
- ACK-gated sequencing;
- malformed/truncated/wrong-version portable input;
- storage/quota failure preserving prior committed data;
- Host credential/origin rejection;
- foreign-process/port/path fail-closed behavior;
- live-DB isolation;
- Current/History/Scanner/Demo Buy missing-history then progressive-history behavior.

If static audit finds a material risk that no existing test actually proves, add the **smallest deterministic regression/proof** before declaring that area green.

## 6. Defect ownership

Any blocking defect discovered by this audit remains in the hardening executor's scope:

```text
root cause
→ smallest correct fix
→ regression proof
→ affected verification
→ green
```

Do not defer a discovered material Replay defect to the user's machine run.

If evidence proves the frozen Replay behavior contract itself is wrong, stop implementation and reopen only the smallest affected planning area before coding forward.

## 7. Durable audit record

Execution must create/update a concise public-safe record at:

```text
.planning/REPLAY_HARDENING_AUDIT.md
```

For every audit area it records:

```text
area
files/boundary reviewed
material risks checked
proof used
findings/fixes if any
final result: PASS | BLOCKED
```

Do not copy private recordings, authenticated dumps or secrets into the audit record.

## 8. Completion evidence

TREE `9.6` is done only when all are true:

- every mandatory static audit area is PASS;
- every mandatory executable proof is green;
- every discovered blocking defect is root-caused/fixed/regression-proven;
- no known material untested Replay risk remains;
- shared server/protocol remains replay-unaware;
- ordinary runtime/DB semantics remain unchanged except for generic live-start fixes proven independently;
- one exact hardening candidate SHA is identified;
- required PR CI is green;
- the PR is reviewed and squash-merged;
- required main CI is green on the merged SHA;
- open-PR audit is clean;
- durable status/execution/handoff point to the next approved work.
