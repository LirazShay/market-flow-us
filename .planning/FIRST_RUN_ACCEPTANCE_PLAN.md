# Market Flow US — First-Run Acceptance Mini-Project

## Purpose

This mini-project turns a machine that has never run Market Flow US into a verified target-machine installation through a serial, diagnosable acceptance path.

It is deliberately broader than an installation guide and narrower than a new product subsystem. It combines:

```text
machine prerequisites
→ repository acquisition / exact SHA
→ dependency installation
→ deterministic local correctness
→ browser/runtime proof
→ local Fake Leumi acceptance
→ target-machine load proof
→ daily DB lifecycle proof
→ real-provider deployment
→ authenticated static smoke
→ market-open acceptance
→ final release closure
```

The user must never be asked to perform several opaque actions and then report only "it does not work". Every stage has one bounded action, one explicit observable result, and one stop point.

## Existing TREE ownership

This is a cross-node release mini-project, not a new capability branch.

It refines execution of the already-frozen release sequence:

```text
7.2  build/prove reusable local Fake Leumi acceptance tooling
  ↓
7.3  stabilize final repository/docs/deployment + first-run runbook + daily lifecycle
  ↓
7.4  guide the user through the first target-machine run and final acceptance
```

No new simulator, database, transport, strategy engine or deployment subsystem is introduced.

### TREE 7.2 ownership

Prepare the deterministic local machinery needed by the first-run path:

- explicit static repeated-identical Fake Leumi mode;
- moving-values mode;
- add/remove membership mode;
- failure/recovery mode;
- service restart/persistence proof;
- isolated persistence probe;
- isolated day-bounded read/Scanner probe;
- representative target-machine `4096 × 180` end-to-end profile;
- sanitized PASS/FAIL report generation;
- smallest practical launcher/command surface for local acceptance.

### TREE 7.3 ownership

Prepare the exact candidate that the user will install and document a single authoritative first-run path:

- final migration/branding cleanup;
- first-run prerequisite list;
- exact clone/update/pin-to-SHA instructions;
- setup instructions;
- deterministic test sequence;
- local demo verification;
- local Fake Leumi acceptance instructions;
- target-machine workload instructions;
- real-provider deployment instructions;
- static authenticated smoke instructions;
- market-open acceptance instructions;
- one-trading-day stop/archive/new-day procedure;
- safe evidence/report locations;
- troubleshooting routing by checkpoint/error code.

The final user-facing runbook should be `docs/FIRST_RUN_ACCEPTANCE.md` and `START_HERE.md` should point to it rather than duplicate it.

### TREE 7.4 ownership

Execute this runbook with the user on the target Windows machine, one checkpoint at a time. Do not batch multiple user-dependent stages into one instruction.

`7.4` remains incomplete until all required target-machine/authenticated acceptance evidence is PASS according to the existing TREE/TEST_STRATEGY contract.

## Operating rules

1. **One checkpoint at a time.** During the actual target-machine run, give the user only the current action plus exactly what result to return.
2. **Stop on first FAIL.** Do not continue downstream to collect more noise.
3. **Root cause before retry.** A failure stays with the layer that exposed it until fixed and regressed.
4. **Resume from last green checkpoint.** Do not restart the whole installation unless the fix invalidates earlier evidence.
5. **Exact SHA matters.** Final authenticated evidence and heavy target-machine evidence must identify the candidate commit.
6. **No secret evidence.** Reports must not contain credentials, cookies, tokens, authorization/session data, account identifiers, full authenticated response dumps or private browser state.
7. **Existing launchers first.** Prefer `SETUP.cmd`, `RUN_TESTS.cmd`, `START_DEMO.cmd`, workload scripts, `START_MARKET_FLOW_US.cmd` and `PREPARE_LIVE_VERIFICATION.cmd`; add only the smallest missing orchestration/reporting.
8. **No silent assumptions.** Every prerequisite that can make the next stage fail should be checked before that stage.
9. **Static is valid.** Equal quote values are not a failure in static/local/static-provider stages.
10. **Movement proof is separate.** Only the final market-open gate can prove real provider movement.

## First-run tree

```text
FR-0  Freeze exact candidate
 |
FR-1  Host prerequisite preflight
 |
FR-2  Acquire/update repository
 |
FR-3  Install deterministic dependencies
 |
FR-4  Fast local correctness
 |
FR-5  Browser build + Chromium E2E
 |
FR-6  Local demo/UI smoke
 |
FR-7  Local Fake Leumi static acceptance
 |
FR-8  Local Fake Leumi dynamic/recovery/restart acceptance
 |
FR-9  Target-machine isolated + end-to-end load acceptance
 |
FR-10 Daily DB lifecycle acceptance
 |
FR-11 Real-provider deployment smoke
 |
FR-12 Authenticated closed/static-market acceptance
 |
FR-13 Authenticated market-open acceptance
 |
FR-14 Final evidence + operational handoff
```

A checkpoint is green only when its explicit evidence is green. Later checkpoints may not be used to excuse an earlier failure.

---

## FR-0 — Freeze the exact candidate

**Goal:** prove which code is being installed and prevent testing a moving branch accidentally.

**Required state:** release cleanup (`7.3`) complete and `main` CI green before the final `7.4` user run.

**User action during final run:** obtain/update the repository and record the exact `HEAD` SHA before setup/acceptance begins.

**PASS evidence:**

- clean working tree;
- expected branch/ref;
- exact SHA captured in the first-run evidence;
- no unexpected open PR or unmerged release work.

**FAIL examples:** dirty tree, wrong branch, SHA differs from the released candidate.

**Failure owner:** repository/release state. Stop before installing/running anything.

---

## FR-1 — Host prerequisite preflight

**Goal:** prove the machine can support the intended product and test toolchain before dependency installation.

**Prerequisites to verify explicitly:**

- supported Windows environment;
- `git` available when using the normal clone/update workflow;
- Node.js **24.x** available;
- `npm` available through that Node installation;
- PowerShell available for current Windows launchers;
- enough writable local disk space for dependencies, Chromium, DuckDB data and reports;
- loopback networking is available;
- no competing Market Flow US service is occupying the required runtime port when a fixed port is used;
- a supported Chromium-family browser is available for the real provider/bookmarklet path (Playwright installs its own pinned Chromium for E2E).

**Implementation preference:** extend/check existing setup tooling rather than inventing a second installer.

**PASS evidence:** concise sanitized preflight report with versions/capabilities, not a full environment dump.

**FAIL routing:**

- missing Node/npm → setup prerequisite;
- wrong Node major → install/activate Node 24.x;
- blocked loopback/port → local machine/network/process issue;
- disk/write failure → host filesystem issue.

Do not run `npm ci` until this checkpoint is green.

---

## FR-2 — Acquire/update repository

**Goal:** ensure the machine is running the authoritative product source rather than a stale ZIP/copy.

**Preferred action:** clone `LirazShay/market-flow-us` once, then fetch/update to the accepted `main` SHA.

**PASS evidence:**

- repository path known;
- `HEAD` matches the intended candidate SHA;
- working tree clean before generated outputs/tests;
- `package-lock.json`, launchers and planning/docs are present.

**FAIL routing:** Git/repository access only. Do not diagnose Node/product behavior yet.

---

## FR-3 — Install deterministic dependencies

**Primary command:**

```text
SETUP.cmd
```

**Goal:** prove exact npm dependencies and pinned Playwright Chromium can be installed on the target machine.

**Expected setup behavior:**

```text
Node 24.x preflight
→ npm ci
→ npx playwright install chromium
→ setup complete
```

No global DuckDB installation should be required; the project owns its Node dependency.

**PASS evidence:**

- command exits successfully;
- `node_modules` exists;
- pinned npm install completed;
- Playwright Chromium installation completed;
- versions/checkpoint summary is sanitized.

**FAIL routing:** installation/toolchain only. Do not run product tests until fixed.

---

## FR-4 — Fast local correctness

**Goal:** validate pure/unit behavior and real local service/DuckDB integration before introducing Chromium/browser composition.

**Preferred diagnostic sequence:**

```text
npm run test:unit
→ npm run test:service
```

`RUN_TESTS.cmd` remains the convenient aggregate command, but first-machine troubleshooting should preserve the layer boundary so a failure is immediately localized.

**PASS evidence:** both suites green, with wall-clock timing noted diagnostically.

**FAIL routing:**

- unit failure → local code/contract regression;
- service failure → Node/service/DuckDB/WebSocket/persistence/read boundary;
- unexpected material slowness → automation-performance defect before proceeding.

---

## FR-5 — Browser build + Chromium E2E

**Goal:** prove the generated browser runtime and normal Chromium composition independently of the user's authenticated browser.

**Actions:**

```text
npm run build:browser
→ npm run test:e2e
```

**PASS evidence:**

- Market Flow US browser artifacts created under the documented `dist` path;
- full E2E green;
- no hidden retry/timeout masking a deterministic defect.

**FAIL routing:** browser build versus Playwright/E2E must remain distinguishable.

---

## FR-6 — Local demo/UI smoke

**Primary command:**

```text
START_DEMO.cmd
```

**Goal:** prove a human-visible normal stack on the target machine before formal acceptance modes.

**Stack under test:**

```text
U.S. Fake Market
→ normal Market Flow US browser runtime / Recorder
→ normal loopback WebSocket service
→ real local DuckDB
→ Viewer surfaces
```

**Manual observable checks:**

1. demo page opens;
2. runtime reaches running state rather than startup error;
3. Current shows synthetic U.S. rows;
4. opening one row reaches Detail/History;
5. Scanner opens and can execute the documented safe built-in example;
6. diagnostics/support snapshot is available;
7. stop with `Ctrl+C` is clean;
8. restart does not corrupt the demo DB.

**PASS evidence:** small local demo report/checklist plus no unsanitized browser/provider data.

This is a usability smoke, not a substitute for formal local acceptance.

---

## FR-7 — Local Fake Leumi static acceptance

**Owner implementation:** TREE `7.2`.

**Goal:** prove the exact closed/static-market semantics that real markets may exhibit outside active movement.

**Required behavior:** several complete identical responses with identical membership and values.

**PASS requires:**

- every response validates;
- every complete cycle receives durable commit acknowledgement;
- History grows once per security per committed cycle;
- Latest remains equal because source values are equal;
- stable membership reuses the same universe revision;
- Current/Security/History remain correct;
- producer ownership/status is correct;
- clean stop succeeds;
- report is sanitized and identifies profile/candidate.

No movement assertion is allowed in this checkpoint.

---

## FR-8 — Local Fake Leumi dynamic/recovery/restart acceptance

**Owner implementation:** TREE `7.2`.

Run as distinct sub-checkpoints so failures stay diagnosable:

```text
FR-8A moving values
FR-8B add/remove membership
FR-8C deterministic provider failure → recovery
FR-8D service restart → persisted authority recovery
```

**PASS requires:**

- moving values reach Current and prior values remain in History;
- membership changes are revision-ACKed before same-response commit;
- provider failure is fail-closed and sanitized;
- recovery commits normally;
- service restart preserves committed authority and saved state expected by the contract;
- Scanner can observe the deterministic movement using already-reviewed SQL.

Do not collapse these into one opaque "acceptance failed" result.

---

## FR-9 — Target-machine isolated + end-to-end load acceptance

**Owner implementation/tooling:** `7.2`; **authoritative execution:** `7.4`.

Run from narrowest to broadest:

```text
FR-9A isolated persistence
→ FR-9B isolated one-trading-day read/Scanner
→ FR-9C representative 4096 × 180 end-to-end
```

This ordering is important: if the end-to-end profile is slow/fails, prior isolated results show whether persistence, read/Scanner or full transport/runtime composition is responsible.

### FR-9A persistence

Use validated generated cycles directly against persistence/DuckDB. Do not pay browser/HTTP cost.

### FR-9B day-bounded reads/Scanner

Seed deterministic one-trading-day-shaped history efficiently, then measure Current, History and Scanner families. Do not replay a literal day through browser transport.

### FR-9C full target profile

Required shape:

```text
4096 securities
× 180 completed end-to-end cycles
= 737280 history rows
```

Required integrity and timing remain those defined by TEST_STRATEGY/TREE `7.4`, including the target-machine five-minute ceiling for the representative end-to-end run.

**PASS evidence:** sanitized machine-readable reports for each sub-profile plus candidate SHA.

---

## FR-10 — Daily DB lifecycle acceptance

**Owner:** `7.3` tooling/docs, executed in `7.4`.

**Goal:** prove the actual operational storage model rather than leaving first use with an undefined next-day procedure.

**Sequence:**

```text
known active-day data + saved query
→ stop producer/service safely
→ archive prior-day market DB/data using documented procedure
→ create/start fresh active-day market authority
→ verify market tables start clean
→ verify saved-query library remains available
```

**PASS evidence:** prior-day archive exists when requested, new active authority is clean, saved queries preserved, no live process still owns the DB during rollover.

---

## FR-11 — Real-provider deployment smoke

**Primary command:**

```text
START_MARKET_FLOW_US.cmd
```

**Goal:** cross from synthetic/local acceptance to the actual deployment boundary without yet claiming formal provider acceptance.

**Sequence:**

1. user authenticates normally in the provider browser page;
2. keep that page open;
3. run launcher;
4. provide normal provider page URL when requested;
5. launcher reduces it to allowed Origin only;
6. current runtime/bookmarklet is built;
7. bookmarklet is copied/opened;
8. local service starts;
9. user runs the bookmarklet from a browser bookmark on the authenticated page.

**PASS smoke:** runtime/service connect without leaking/copying authentication material, producer reaches a valid running state or a stable diagnosable provider error.

A provider error here is not hidden; stop and fix before formal authenticated smoke.

---

## FR-12 — Authenticated closed/static-market acceptance

**Owner:** TREE `7.4`.

**Goal:** prove the real provider shape/transport/authority boundary even when market values legitimately repeat.

Required gate remains the TEST_STRATEGY contract:

- at least 5 consecutive complete provider responses;
- exact validation for every response;
- stable membership reuses revision;
- durable commit ACK for every cycle;
- Current reflects repeated provider values;
- History records every committed cycle;
- Security read works;
- bounded already-reviewed Scanner query works;
- ownership/status correct;
- clean producer stop;
- sanitized SHA-bound report.

No movement requirement.

---

## FR-13 — Authenticated market-open acceptance

**Owner:** TREE `7.4`.

**Goal:** prove the final real moving-market boundary on the same accepted candidate.

Required gate remains:

```text
at least 20 consecutive complete ScreenerHulPaging3 cycles
spanning at least 60 seconds
+ observable provider market/freshness change
+ committed Current/History reflection
+ bounded Scanner
+ correct ownership/status
+ clean stop
```

If no real change is observed while the market is expected to be active, movement-specific evidence remains inconclusive/pending. Do not fabricate PASS and do not weaken the gate.

---

## FR-14 — Final evidence and operational handoff

**Goal:** make first installation end in a known operational state, not merely "tests ran once".

Required closure summary:

- exact accepted SHA;
- FR-0..FR-13 status table;
- paths/names of sanitized reports retained locally;
- current normal DB path;
- daily stop/archive/new-day procedure understood/proven;
- normal start/stop commands understood;
- Support Snapshot recovery path understood;
- no blocking defect open;
- main CI green after any fixes discovered during acceptance.

Only after the existing TREE `7.4` success evidence and normal merge/main-green closure are satisfied may overall product completion be declared.

## Evidence format

Where automation is involved, prefer one compact machine-readable report per acceptance profile. The report should be suitable for the user to paste back into ChatGPT without exposing private information.

Recommended common envelope:

```json
{
  "product": "market-flow-us",
  "candidateSha": "<git sha>",
  "checkpoint": "FR-7",
  "profile": "static",
  "status": "PASS",
  "startedAt": "<local timestamp or duration metadata>",
  "durationMs": 0,
  "summary": {},
  "diagnostic": null
}
```

On failure:

```json
{
  "status": "FAIL",
  "diagnostic": {
    "component": "<stable component>",
    "checkpoint": "<stable checkpoint>",
    "code": "<stable error code>",
    "message": "<sanitized bounded causal message>"
  }
}
```

Never include:

```text
credentials
cookies
authorization/session tokens
account identifiers
full authenticated provider URL when it contains private state
raw authenticated provider dumps
private browser state
```

## Actual user-guidance protocol

When Chat 10 / TREE `7.4` reaches the user-run phase, interaction should look like this:

```text
assistant: one action only
assistant: exact expected PASS output/check
assistant: exact small result block to paste back
user: result
assistant: validate
  PASS → advance exactly one checkpoint
  FAIL → diagnose/fix/rerun same checkpoint
```

Do not give the user FR-1 through FR-13 as one giant instruction list during execution. This document is the planning map; the live guidance must stay incremental.

## Why this does not add a new TREE leaf

The existing release leaves already own every required capability:

- `7.2` owns deterministic local acceptance machinery and load tooling;
- `7.3` owns final run/deployment/acceptance documentation and daily lifecycle;
- `7.4` owns all target-machine/authenticated execution.

Adding another leaf would duplicate ownership rather than close a missing product capability. The durable mini-project exists to make those three leaves operate as one diagnosable first-machine pipeline.
