# AI Investigation Pack — Demo Buy Forensic Review Contract

## 1. Purpose

After a Demo Buy observation has enough outcome evidence, the user must be able to ask an external AI a substantially better question than:

> Why did this stock go down?

The product must generate a local, reproducible evidence pack that lets an AI investigate:

- why the exact Scanner SQL ranked/selected the security;
- what facts were actually available before the virtual buy;
- what warning signals may have been present in other persisted fields or calculable pre-buy features;
- how the selected security compared with nearby high-ranked candidates from the same Scanner generation;
- what happened after the virtual buy;
- what minimal SQL changes might have filtered, de-ranked or better distinguished the failed candidate;
- which proposed changes are hypotheses that require validation across many Demo Buy observations rather than overfitting one failure.

This is a **forensic strategy-improvement export**, not an AI trading agent and not an autonomous query editor.

## 2. Product boundary

Phase 1 adds no cloud/API integration and stores no AI credentials.

The workflow is:

```text
Demo Buy observation
→ Generate AI Investigation Pack
→ Node builds deterministic local evidence files
→ Viewer exposes local export location + Copy AI Prompt
→ user uploads/pastes the pack into the AI of their choice
→ AI proposes hypotheses / SQL improvements
→ user decides what to test
```

The product never automatically applies AI-proposed SQL to the active Scanner query.

## 3. Non-negotiable anti-hindsight rule

The pack separates evidence into two classes:

```text
PREDICTION-TIME EVIDENCE
OUTCOME EVIDENCE
```

Prediction-time evidence may be used to propose a future Scanner rule.

Outcome evidence may be used only to evaluate what happened after the decision and to generate hypotheses. It must **not** be presented as though it was available to the original query.

Every generated prompt explicitly instructs the AI:

1. do not use any timestamp after the virtual-buy acceptance as an input to a proposed predictive rule;
2. when citing a warning signal, identify the exact pre-buy field/history evidence supporting it;
3. label suggestions that cannot be derived from available pre-buy data as invalid for Scanner use;
4. distinguish observed fact, derived calculation and hypothesis;
5. do not infer provider field semantics beyond the included data dictionary;
6. do not claim that source `Price` proves a real executable fill;
7. treat a single failed observation as insufficient evidence for adopting a rule;
8. recommend validation across the wider Demo Buy corpus before accepting a change.

## 4. Evidence sources

The pack is built only from local persisted/immutable product evidence:

- exact capture-level Scanner SQL provenance;
- Scanner generation timing and result rank;
- bounded Scanner result comparison context frozen at capture time;
- the selected security's persisted `history` before the decision;
- the exact linked Demo Buy baseline row;
- the selected security's persisted `history` after the decision;
- Node-derived Demo Buy horizon outcomes;
- the documented Market Flow US field semantics/uncertainties.

No authenticated browser state, cookies, headers, account identifiers or raw private session data may enter the pack.

## 5. Why bounded Scanner result context must be durable

Re-running the SQL later is not equivalent to preserving the original Scanner result because `latest` and `history` continue changing.

Therefore each Demo Buy capture also freezes a **bounded comparison context** from the exact successful Scanner generation.

The context contains the first **50 source result rows in exact SQL order**, together with the result column names and original 1-based ranks.

This is provenance, not a second market authority.

Its purpose is to let the AI answer questions such as:

- Why was the eventual loser rank 1?
- What values distinguished it from ranks 2–10?
- Was a suspicious field already weaker than peers?
- Could a different tie-break/filter have preferred another candidate?

The context is bounded so automatic Demo Buy capture does not persist an unbounded copy of arbitrary Scanner results.

### Context encoding

The implementation must use deterministic JSON-safe encoding and a bounded representation.

Requirements:

- preserve column names, row order and original ranks;
- preserve normal numeric/null/boolean/string values exactly when within bounds;
- very large cell values may be clipped only by an explicit deterministic cell-size limit;
- every clipped value is marked as truncated in metadata;
- one bounded context cannot make the ordinary Demo Buy capture silently change row selection semantics;
- if context shaping fails, capture must fail visibly before commit rather than persist a misleading “complete” context.

The exact byte/cell limits are implementation constants documented and covered by tests; they must stay comfortably below the existing 16 MiB WebSocket inbound boundary.

## 6. Persisted context

Schema v4 is expanded before release to retain the bounded Scanner comparison context as immutable capture provenance.

The smallest acceptable representation is one capture-level JSON provenance field, conceptually:

```text
source_result_context_json JSON NOT NULL
```

containing:

```text
columns
rows[0..49]
resultRank per row
truncation metadata
```

Do not create another market-data authority or persist future outcomes into this field.

The existing capture/item/history relations remain authoritative for virtual-buy identity and outcomes.

## 7. Investigation target

The user starts an investigation from one Demo Buy item:

```text
captureId + securityId
```

The target must belong to that capture.

The pack builder never accepts arbitrary SQL/file paths from the browser and never reads data outside the active/archived database explicitly opened by the product workflow.

## 8. Time windows

Default forensic windows are fixed and documented so two exports of the same complete evidence are comparable:

```text
pre-buy target history:
  30 minutes ending at capturedAtMs

post-buy target history:
  from capturedAtMs through capturedAtMs + 10 minutes
```

The pre-buy window includes the signal-to-capture interval and therefore lets the AI see whether the market changed while the capture was waiting.

Rows remain exact persisted observations; the exporter does not interpolate missing samples.

If the database does not yet contain the full post-buy window, the pack is still valid but the manifest marks it `PARTIAL_OUTCOME` and records the latest included observation. The UI must make that status visible before export.

A `COMPLETE_OUTCOME` pack requires the evidence boundary to have reached at least the 10-minute target or otherwise have a terminal active-day boundary that makes later same-day evidence impossible.

## 9. Generated local bundle

One investigation produces a deterministic folder under an ignored local export root, conceptually:

```text
exports/ai-investigations/<captureId>-<securityId>-<generatedAt>/
```

Required files:

```text
README.md
PROMPT.md
MANIFEST.json
QUERY.sql
SCANNER_CONTEXT.json
TARGET_BEFORE.jsonl
BASELINE.json
TARGET_AFTER.jsonl
OUTCOME.json
FIELD_GUIDE.md
```

No generated investigation artifact is committed to the repository.

### `README.md`

Explains what to upload, evidence boundaries, and whether outcome evidence is partial/complete.

### `PROMPT.md`

The high-quality reusable investigation instruction. It references the accompanying files rather than duplicating all evidence inline.

### `MANIFEST.json`

Contains only bounded structural metadata, including:

```text
packFormatVersion
productVersion
captureId
securityId
resultRank
generatedAtMs
sourceResultStartedAtMs
sourceResultCompletedAtMs
capturedAtMs
baselineCollectedAtMs
preWindowStartMs
postWindowEndMs
latestIncludedPostObservationMs
outcomeEvidenceStatus
file list / record counts
truncation flags
```

### `QUERY.sql`

Exact immutable SQL from the capture provenance.

### `SCANNER_CONTEXT.json`

The frozen first-50 result comparison context from the original Scanner generation, including original ranks and truncation metadata.

### `TARGET_BEFORE.jsonl`

Every persisted target-security history row in the 30-minute pre-buy window, ordered oldest → newest, including typed fields and preserved `raw_data`.

### `BASELINE.json`

The exact linked `(buy_cycle_id, security_id)` history row used as the virtual-buy baseline.

### `TARGET_AFTER.jsonl`

Every persisted target-security history row after capture through the 10-minute evidence boundary, ordered oldest → newest.

### `OUTCOME.json`

The same trusted Node horizon model used by Demo Buy: target time, observed time, elapsed time, future Price, percentage, outcome and unavailable reason for all fixed horizons.

### `FIELD_GUIDE.md`

A compact extraction from the durable data contract explaining:

- canonical identity;
- source-shaped `Price` semantics;
- local `collected_at_ms` / Scanner timing / `captured_at_ms` distinctions;
- null/zero/missing distinction;
- known typed fields;
- fields whose exact provider semantics remain empirical;
- the fact that Phase 1 is not fill/liquidity evidence.

## 10. Prompt contract

`PROMPT.md` asks the AI to perform the following analysis in order.

### A. Reconstruct the original decision

- Explain the query in plain language.
- Identify the ORDER BY / ranking logic and filters.
- Using `SCANNER_CONTEXT.json`, explain why the target occupied its original rank relative to nearby candidates.
- Identify any data needed by the SQL that is missing/truncated and say so rather than inventing it.

### B. Inspect prediction-time warning signals

Use only `TARGET_BEFORE.jsonl`, `BASELINE.json` fields that existed by capture time, `SCANNER_CONTEXT.json`, and the query.

Search for:

- weakening/acceleration/reversal patterns;
- stale baseline or signal-to-capture latency;
- bid/ask/Price relationships when available;
- volume/change/high/low/yesterday/market-cap/source fields when available;
- repeated null/stale values;
- candidate-vs-peer differences;
- additional calculations derivable only from pre-buy persisted history.

The AI must cite the concrete field/timestamp evidence for each claimed signal.

### C. Explain the outcome without leaking it backward

Use `TARGET_AFTER.jsonl` and `OUTCOME.json` to describe what happened after capture.

Explicitly separate this explanation from predictive inputs.

### D. Generate query-improvement hypotheses

For each proposal provide:

```text
hypothesis
pre-buy evidence used
minimal SQL change or SQL fragment
whether it would have filtered or de-ranked this target
expected benefit
possible false-negative cost
overfitting risk
additional Demo Buy evidence needed
```

Start with the smallest KISS modification before proposing broader rewrites.

### E. Counterfactual and peer check

For every proposed improvement, answer:

- Would this rule have rejected/de-ranked the failed target using only pre-buy information?
- What would it likely do to the neighboring high-ranked candidates visible in the frozen context?
- Is the rule merely fitted to this one failure?

### F. Validation plan

Finish with a concrete plan for testing the proposed SQL change over many existing/future Demo Buy observations before replacing the current query.

The AI should recommend measurable comparison criteria rather than declaring a new rule “better” from one anecdote.

## 11. UI workflow

On the Demo Buy screen each observation exposes an investigation action:

```text
Generate AI Investigation Pack
```

The UI shows:

- target identity/rank;
- whether the 10-minute outcome evidence is partial or complete;
- generated local folder/path after success;
- `Copy AI Prompt` after generation;
- `Regenerate` to rebuild from later history if the prior pack was partial;
- clear generation error without mutating the Demo Buy observation.

Generating a pack is a read/export operation. It never changes Scanner SQL, Demo Buy capture facts, market authority or automatic capture state.

## 12. Service boundary

Use the existing Viewer WebSocket/local Node service; no second API is introduced.

Conceptual operation:

```text
demo.buy.ai-pack.create
```

Payload:

```text
captureId
securityId
```

The server:

1. validates target membership in the capture;
2. loads immutable capture/query/context provenance;
3. loads the exact baseline;
4. loads bounded target before/after history;
5. reuses the trusted Demo Buy evaluator for `OUTCOME.json` rather than implementing a second horizon algorithm;
6. generates deterministic sanitized files under the controlled export root;
7. returns pack metadata/path and prompt text suitable for clipboard copying.

Do not accept a browser-supplied output path.

## 13. Determinism and regeneration

For the same DB evidence and pack-format version, semantic file content is deterministic except `generatedAtMs` and the generated directory name.

Regeneration after more market history arrives may change only evidence that was previously unavailable/partial and the derived outcome file/manifest fields that depend on it. Immutable query/context/baseline evidence never changes.

The manifest records `packFormatVersion` so future prompt/evidence changes are diagnosable.

## 14. Security and public-safe repository rules

Generated packs are local user artifacts, not repository fixtures.

Implementation requirements:

- export root is git-ignored;
- safe internally generated directory/file names only;
- no credentials/cookies/auth headers/browser session data/account identifiers;
- no raw authenticated HTTP dumps;
- no arbitrary path traversal;
- diagnostics mention pack/capture IDs and file counts, not entire SQL/history payloads;
- tests use synthetic/sanitized data only.

## 15. Verification

### Unit

Prove:

- pack prompt sections and anti-hindsight instructions;
- deterministic target/window boundaries;
- context rank/order preservation;
- context bounding/truncation markers;
- partial vs complete outcome classification;
- safe export naming/path construction;
- no browser-controlled output path;
- field-guide semantics remain aligned with DATA_CONTRACT.

### Real DuckDB/service

Prove:

- target must belong to capture;
- exact immutable query/context/baseline are exported;
- before rows never exceed `capturedAtMs`;
- after rows never precede capture or exceed the fixed 10-minute boundary;
- baseline is the exact linked row;
- outcome file equals the trusted Demo Buy evaluator result;
- partial pack regenerates to complete when later history appears;
- pack generation mutates no DB authority;
- restart can regenerate the same investigation from persisted evidence.

### Browser E2E

Prove:

1. capture a rank-1 candidate with visible comparison rows;
2. create future history in which that candidate falls;
3. generate the pack from the Demo Buy observation;
4. UI clearly reports partial/complete evidence;
5. generated manifest/query/context/before/baseline/after/outcome/prompt files are present;
6. Copy AI Prompt exposes the exact generated prompt;
7. regeneration after additional history updates only outcome-dependent evidence;
8. pack failure is visible and does not break Scanner/Demo Buy;
9. existing Current/Detail/Scanner/Demo Buy regressions remain green.

## 16. Explicit non-goals

Not included in this release:

```text
calling an AI provider automatically
storing an AI API key
letting AI edit/activate Scanner SQL automatically
claiming causal explanations from one observation
automatically accepting suggested rules
internet/web enrichment
broker/order/fill analysis
Phase-2 liquidity/sellability analysis
long-term AI conversation storage
```

The product supplies high-quality evidence and a disciplined prompt; the human remains responsible for deciding which hypotheses become experimental SQL.