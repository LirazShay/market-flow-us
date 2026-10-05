# Demo Buy / AI Investigation UX Contract

## 1. Purpose and ownership

This document owns the Phase-1 browser interaction and operability contract for Demo Buy and AI Investigation.

While the comprehensive replan remains `active`, this document is the normative UX owner. `PRODUCT_REQUIREMENTS`, `PRODUCT_SPEC`, `DEMO_BUY_VALIDATION`, `AI_INVESTIGATION_PACK`, `TEST_STRATEGY` and TREE success evidence must be aligned to it before freeze.

The UX goal is simple:

```text
Scanner says candidate
→ user/auto records a virtual buy
→ Demo Buy makes the later outcome obvious
→ user can investigate one observation with AI-quality evidence
```

The UI must expose uncertainty honestly and must not make background capture, stale timing, missing evidence or transport ambiguity look like a confirmed trading fact.

## 2. Top-level navigation and persistent state

The Viewer top-level destinations are:

```text
Current | Scanner | Demo Buy
```

Scanner remains mounted while another top-level surface is visible, preserving the existing scheduler lifecycle.

Because automatic Demo Buy capture may continue while Scanner is hidden, the Viewer toolbar must expose a persistent compact indicator whenever auto mode is enabled:

```text
Auto Demo Buy: All
Auto Demo Buy: Top 5
```

The indicator is visible on Current, Scanner and Demo Buy. It includes a direct `Turn off` action so the user does not need to navigate back to Scanner merely to stop background observations.

When auto mode is off the toolbar may omit the indicator or show `Auto Demo Buy: Off` compactly.

Auto configuration is Viewer-session state only; relaunch starts with Auto Off.

One shared browser Demo Buy controller owns auto configuration, capture busy/unknown state and AI-export busy state for all top-level surfaces. Scanner and Demo Buy surfaces consume that shared state; they do not maintain conflicting copies.

## 3. Scanner generation identity in the UI

Demo Buy controls always operate on the exact last successfully rendered Scanner generation, not whatever text currently exists in the editable draft.

The Scanner result area therefore labels the generation provenance compactly:

```text
Active result: <query label or Unsaved query>
Completed: <time>
Rows: <rowCount>
```

If the draft has changed since that result was produced, capture controls still refer to the displayed active-result generation. The UI must not imply that an edited-but-not-activated draft produced the rows.

At the moment the user invokes Selected/All/Top-X capture, Browser freezes the displayed generation snapshot and chosen source-row set synchronously before starting async submission. A newer recurring Scanner result cannot change the items/provenance of an already-started capture.

## 4. Scanner selection interaction

When a generation contains exactly one recognized canonical identity column (`securityId` or `security_id`), the result table adds a leading selection column.

Requirements:

- every valid-identity row has an accessible checkbox;
- invalid-identity rows are visibly ineligible and their checkbox is disabled/absent with an explanatory reason;
- clicking or pressing Space on a checkbox must not trigger the existing row-to-Detail navigation;
- interactive controls inside a result row do not bubble into row navigation;
- selection state belongs only to the current rendered generation and resets when a new generation replaces it;
- the UI shows the selected-row count;
- `Demo Buy selected (N)` is disabled when N=0;
- manual selection does not silently drop invalid rows.

A header select-all checkbox is optional; if implemented it operates only on eligible rows in the currently rendered generation and does not change the semantics of the separate `Demo Buy all` action.

## 5. Capture controls and no-surprise semantics

With a Demo-Buy-capable generation, Scanner shows compact controls for:

```text
Demo Buy selected (N)
Demo Buy all (<source row count>)
Top X: [input]  Demo Buy Top X
Auto: Off | All | Top X
```

The UI keeps the distinction between **source rows chosen** and **unique captured securities** visible when duplicates exist. For example:

```text
Top 10 source rows → 8 unique Demo Buy items
```

No confirmation modal is required merely because All/Top-X contains many virtual observations; this is analytical evidence, not a real order. Instead, the exact row/item counts and bounds are visible before submission.

`All`/`Top X`/Auto preflight failures are actionable:

- missing/ambiguous identity column → “Return exactly one securityId/security_id column.”
- invalid identity in chosen range → identify the first invalid source rank and refuse the whole action;
- exact SQL above Demo Buy provenance bound → Scanner remains usable but capture is disabled with a provenance-size explanation;
- context cannot satisfy bounded shaping → refuse capture and advise narrowing SELECT/result width where practical;
- All above the unique-item bound → advise Top X or narrower SQL;
- invalid Top X → show allowed range without submitting.

No hidden truncation is presented as success.

## 6. Automatic capture UX

Auto mode is explicitly user-controlled and has three states:

```text
Off
All
Top X
```

Rules:

1. changing Auto state affects only **future successful Scanner generations**;
2. enabling Auto does not retroactively capture the already-rendered generation;
3. changing Auto Top X takes effect from the next generation;
4. one Viewer-wide capture slot covers manual and automatic capture;
5. when capture is busy, a new automatic generation is skipped, not queued;
6. a successful zero-row generation is a normal no-op, not an error and not a busy-skip;
7. a skipped generation does not stop Scanner scheduling;
8. auto capture remains enabled after an ordinary confirmed rejection unless the failure is a deterministic generation-ineligibility condition the user must fix;
9. after `ACKNOWLEDGEMENT_UNKNOWN`, capture is locked for that Viewer instance until explicit relaunch/recovery as defined by the protocol contract.

Turning Auto Off while an automatic capture is already in flight does **not** cancel that request. The in-flight request reaches its normal confirmed/unknown outcome; Off only prevents later generations from starting another automatic capture. Likewise, changing Auto Top X does not mutate an already-frozen in-flight request.

The UI does not append an unbounded log line for every generation. It shows a bounded status summary:

```text
Auto mode
last capture result/time
last captured item count
busy-skipped generation count since Auto was enabled
last skip/error reason
```

For a deterministic recurring ineligibility such as oversized SQL or missing identity column, Auto remains configured but the persistent indicator also shows `Blocked for current result: <reason>` and no request is sent for that generation.

A zero-row successful generation may update a compact `No candidates in latest generation` status but does not increment failure/skip counters.

## 7. Capture outcome states

Scanner presents capture outcomes distinctly:

### Confirmed committed

Show success with:

```text
captureId
captured item count
capture time
```

### Confirmed rejected

Show an actionable stable reason. Do not clear the Scanner result/selection merely because the capture failed.

### Acknowledgement unknown

Transport loss after request dispatch is shown as:

```text
Capture result unknown — it may already have been saved.
Relaunch the Viewer and refresh Demo Buy before creating another capture.
```

Never label this as “failed” and never expose a Retry Capture button for the unknown request.

## 8. Demo Buy screen information architecture

The screen is capture-oriented, because query/timing provenance belongs to the capture while outcomes belong to items.

Render a page as capture groups:

```text
Capture header
  query label
  capture time
  signal/result-ready time
  manual / automatic + selection mode
  item count
  timing anomaly indicator when present
  View provenance / SQL

  item rows ordered by original resultRank
```

Do not repeat exact SQL or large capture provenance in every item row.

A 50-item page may split one large capture across page boundaries. Every page response must include enough compact capture metadata to render a header for each capture represented on that page. When a page starts in the middle of a capture, the UI repeats the capture header and may mark it `continued`; item rows are never shown without their capture context.

## 9. Demo Buy table layout

The outcome table must remain usable despite ten horizons.

Sticky/frozen leading columns should cover at least:

```text
resultRank
Symbol / display name
securityId
baseline Price
```

Capture-level fields live in the group header rather than becoming repeated wide columns.

Each horizon is **one compact cell**, not three independent table columns. A typical cell contains:

```text
UP +0.42%
$123.45
```

or:

```text
Pending
```

or:

```text
UNAVAILABLE
baseline Price is zero
```

This preserves Price + percentage + explicit outcome while keeping the table to ten horizon columns instead of roughly thirty.

A wide horizontally scrollable table is still acceptable. Horizontal scrolling must not hide the target identity because the leading identity columns remain sticky.

## 10. Outcome-state presentation

The underlying outcome contract remains:

```text
UP
DOWN
FLAT
UNAVAILABLE
```

The UI adds presentation meaning without changing those values:

- `NO_FUTURE_OBSERVATION` → show `Pending / ממתין` prominently, with technical outcome `UNAVAILABLE` available in details;
- `BASELINE_PRICE_UNAVAILABLE` → warning-style `UNAVAILABLE`;
- `BASELINE_PRICE_ZERO` → warning-style `UNAVAILABLE`;
- `FUTURE_PRICE_UNAVAILABLE` → warning-style `UNAVAILABLE`.

Therefore the user can distinguish “wait for more market evidence” from “this observation cannot produce a valid percentage”.

Direction is never color-only. Text/symbol remains visible.

For each matched horizon, details/tooltip may expose:

```text
target time
actual observed time
actual elapsed time
unavailable reason
```

The row also exposes a compact progress summary such as:

```text
6 / 10 horizons observed
```

where a matched future row counts as observed even when its Price is NULL; outcome usability remains separately represented.

## 11. Refresh and pagination behavior

`Load more` appends the next stable keyset page to the currently displayed continuation walk.

`Refresh latest` explicitly resets the Demo Buy result to the first page and discards previously loaded continuation pages. This is intentional: it makes newly inserted automatic captures visible without mixing two pagination snapshots.

The label must say `Refresh latest` rather than a vague `Refresh` so the reset semantics are understandable.

A failed refresh keeps the prior successfully rendered data visible and shows a retryable error; it must not blank the entire screen unnecessarily.

Loading the next page fails independently: already loaded captures/items remain visible and `Load more` can be retried.

### Targeted observation refresh

A user may keep one observation open for several minutes while Auto continues inserting newer captures. Therefore progressive inspection cannot depend only on `Refresh latest`, which may push the target out of the first page.

Add one bounded Viewer-role read:

```text
demo.buy.observation.get
```

Payload:

```text
captureId
securityId
```

It returns the same browser-ready baseline/timing/horizon model for exactly one existing capture item, using the same trusted evaluator and authority-watermark rules as `demo.buy.page`.

The expanded row/investigation panel exposes `Refresh observation`. It updates that observation in place without changing list pagination or scrolling and remains usable while new Auto captures arrive.

A targeted refresh error affects only that observation panel/row and preserves the prior trustworthy values.

## 12. Capture provenance details

`View provenance / SQL` loads `demo.buy.capture.get` on demand.

The details panel shows:

```text
query ID/name when present
exact SQL
Scanner interval
Scanner started/completed raw timestamps
source row count
selection mode
manual/automatic
Top X when applicable
captured item count
timing anomalies when present
```

The details panel makes clear that raw wall-clock timestamps are diagnostics and writer/cycle ordering is the authority boundary.

A provenance-read error affects only the details panel, not the already-rendered Demo Buy outcomes.

## 13. AI Investigation entry point

Every Demo Buy item has one compact action:

```text
Investigate with AI
```

The action opens/expands an investigation panel for that observation rather than adding many AI controls directly into the wide horizon table.

Before generation, the panel shows:

```text
captureId / security identity / original resultRank
target in retained Scanner context: Yes / No
outcome evidence: Partial / Complete
current horizon progress
```

`targetInScannerContext=false` is explanatory, not an error. The panel states that exact peer/rank reconstruction is limited but SQL/history/outcome investigation still works.

The panel may use `demo.buy.observation.get` to refresh the target before generation so the visible outcome state and generated pack are based on current committed evidence without requiring a list reset.

## 14. AI pack generation workflow

The panel offers:

```text
Generate AI Investigation Pack
```

or after a prior generation:

```text
Regenerate
Copy AI Prompt
Copy folder path
```

One Viewer-wide AI-export slot allows at most one Generate/Regenerate request in flight. While busy, all Generate/Regenerate controls are disabled/refused visibly; Scanner scheduling and Demo Buy reads remain logically independent.

A successful generation shows:

```text
PARTIAL_OUTCOME | COMPLETE_OUTCOME
relative export folder
pack file count
latest included post-observation time when partial
```

The service returns/displays an export path **relative to the Market Flow US project/export root**, for example:

```text
exports/ai-investigations/<generated-folder>/
```

The response, prompt and manifest do not embed an absolute host path or Windows user-profile path. This keeps the evidence portable and avoids leaking machine/user identifiers when the prompt/files are shared externally.

The panel provides concise user instructions:

```text
1. Copy the AI prompt.
2. Open the shown folder under your Market Flow US project folder.
3. Attach/upload the files from that folder to the AI you choose.
4. Paste/send the prompt with those files.
```

No AI provider is called automatically.

The browser is not required to launch the OS file manager. Phase 1 uses a visible selectable relative path plus `Copy folder path`, avoiding a new desktop/shell-integration subsystem.

## 15. Clipboard fallback

`Copy AI Prompt` and `Copy folder path` follow the product's existing support-snapshot pattern:

- attempt `navigator.clipboard.writeText`;
- on success show a concise copied confirmation;
- when clipboard access is unavailable, reveal/focus selectable fallback text so the user can copy manually;
- clipboard failure is not reported as pack-generation failure.

## 16. Partial/complete investigation UX

The user may generate a pack before ten minutes have elapsed/progressed through persisted authority. Do not force a wait.

For `PARTIAL_OUTCOME`, the UI says that later evidence is still incomplete and `Regenerate` can update outcome-dependent files.

For `COMPLETE_OUTCOME`, the UI says the database authority progressed through the full ten-minute evidence boundary; individual horizons may still be unavailable for their explicit data reasons.

The UI never claims `COMPLETE_OUTCOME` means the trade would have been executable or profitable.

## 17. AI-export failure and lost acknowledgement

A normal confirmed export error shows an actionable message and leaves the observation untouched.

If the Viewer connection is lost after AI-pack request dispatch, the UI/relaunch guidance may say:

```text
The pack may already have been generated locally. After relaunch, it is safe to generate again.
```

Unlike Demo Buy capture, regenerating an AI pack after reconnect is safe because export mutates no DB authority and uses a collision-safe new directory.

## 18. Empty, loading and error states

Demo Buy must have explicit:

- initial loading;
- no observations yet;
- populated;
- first-page read error;
- continuation read error;
- targeted-observation refresh error;
- provenance-detail error;
- AI-export error;
- connection-lost/relaunch-required states.

The empty state tells the user exactly how to create the first observation:

```text
Run a Scanner query that returns exactly one securityId/security_id column,
then use Demo Buy selected/all/Top X or enable Auto.
```

Errors should be scoped to the smallest affected surface and preserve already trustworthy data wherever possible.

## 19. Operability and diagnostics

Sanitized support diagnostics may include:

```text
current top-level surface
auto Demo Buy mode
auto blocked reason category
auto busy-skipped count
capture slot busy/not busy
last capture outcome category
Demo Buy loaded item count
AI-export slot busy/not busy
last AI-export outcome category
```

Do not include SQL text, Scanner result rows, history rows, absolute filesystem paths, pack prompt/evidence content or authenticated provider/session data in support diagnostics.

## 20. Accessibility and interaction safety

- all buttons/inputs have explicit labels;
- status changes use bounded `aria-live` regions rather than producing endless announcements;
- checkboxes include target rank/identity in their accessible name;
- busy controls are disabled rather than accepting duplicate clicks;
- focus remains usable after errors;
- details panels have explicit open/close controls;
- direction and warning state never depend on color alone;
- horizontal scrolling does not remove the sticky identity context.

## 21. Explicit Phase-1 UX non-goals

Do not add in this increment:

```text
aggregate strategy dashboard
win-rate scorecard
charting subsystem
AI chat embedded in Market Flow US
automatic AI upload/send
OS shell/file-manager integration
real-order confirmation dialogs
portfolio/P&L UI
cross-day investigation browser
complex filter/search system for Demo Buy
```

The Phase-1 screen is an inspection and forensic workflow, not a trading terminal rewrite.

## 22. UX verification scenarios

Focused unit/Chromium proof must include at least:

1. identity-capable Scanner result shows capture controls and accessible row selection;
2. checkbox interaction never opens Detail;
3. new Scanner generation resets selection and an in-flight capture keeps its frozen prior snapshot;
4. Auto enabled after a result waits for the next generation;
5. zero-row Auto generation is a no-op and does not count as error/skip;
6. persistent Auto indicator survives navigation, exposes blocked state and can be turned off from Demo Buy;
7. turning Auto Off during an in-flight capture prevents future auto captures but does not pretend to cancel the current request;
8. busy-auto skip increments bounded status without creating queued capture requests;
9. capture confirmed/failed/acknowledgement-unknown states are distinct and actionable;
10. Demo Buy renders grouped capture headers plus sticky identity columns and one compact cell per horizon;
11. a capture split across page boundaries still has a visible repeated/continued capture header;
12. `NO_FUTURE_OBSERVATION` appears as Pending while non-temporal unavailable reasons appear as warnings;
13. `Refresh latest` resets to first page while `Load more` appends and continuation failure preserves prior rows;
14. `Refresh observation` updates an older open target in place while newer Auto captures continue to arrive;
15. provenance-detail failure does not erase outcomes;
16. AI investigation panel clearly shows context coverage and partial/complete status;
17. one export slot prevents repeated Generate/Regenerate queueing;
18. Copy AI Prompt and Copy folder path both have clipboard fallback and only a relative export path is exposed;
19. AI export lost-ack guidance permits safe regeneration but capture lost-ack guidance forbids blind capture replay;
20. existing Current/Detail/Scanner navigation and recurring scheduling remain usable.
