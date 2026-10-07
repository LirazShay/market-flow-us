# R-US-PRE-ACCEPTANCE-CODE-AUDIT-REPLAN

## Trigger

The user explicitly requested that all recently added feature code receive a serious staged code review/bug hunt before final acceptance, with development defects fixed before user-dependent acceptance continues.

## Smallest affected planning area

Reopen only release branch `7` between completed extension leaves (`7.5`, `8.5`, `9.6`) and final acceptance `7.4`.

Do not reopen completed feature contracts or redesign their architecture. Add one deterministic pre-acceptance reclosure family `7.6` that audits the exact recent extension delta and blocks `7.4` until complete.

## Scope decision

Use exact extension range:

```text
e0af9d105004f175a44ec33fa481fba0631773bf
..
93a48c8b0a36433e58f09f6a607ec7cd366c9aea
```

This captures the 35 commits added after completed Demo Buy/AI reclosure, principally:

- standalone IBKR order service;
- Basic Detail BUY integration;
- Recording/Replay/Host;
- Replay hardening;
- shared runtime/viewer/config/protocol/diagnostic seams touched by those features;
- launchers/build/acceptance/CI wiring added with them.

This is preferred over re-auditing the whole repository because older U.S./Demo Buy/AI code already has completed reclosure evidence, while later changes can still be reviewed at their shared interaction seams.

## Staging decision

Use five serial leaves:

```text
7.6.1 delta inventory + contract/proof map
7.6.2 IBKR order service + Basic BUY deep audit
7.6.3 Recording/Replay/Host deep audit
7.6.4 shared integration/regression audit
7.6.5 adversarial verification + deterministic reclosure
```

The stages separate materially different review modes while keeping one chat responsible for defects it discovers.

## Defect rule

A blocking defect discovered by `7.6` remains Chat 27 responsibility:

```text
root cause
→ smallest sufficient fix
→ deterministic regression proof
→ affected verification
→ resume audit
```

No symptom-only workaround and no acceptance deferral for a defect that can be resolved deterministically before acceptance.

## Completion claim

Do not claim literal mathematical absence of all bugs. `7.6` is complete only when:

- every material production/runtime file in the exact extension range is mapped/reviewed;
- no known material defect remains;
- no material review risk remains unsupported by deterministic proof;
- every discovered blocking defect is fixed/regression-proven;
- required focused and broad deterministic gates are green;
- audit report, PR/main CI and open-PR truth are clean;
- one exact audited runtime candidate is pinned for `7.4`.

## Allocation

- Chat 27: `7.6.1` → `7.6.5`.
- Chat 28: `7.4` final target-machine/provider acceptance.

`7.4` gains dependency on `7.6.5` and cannot resume before that leaf is `done`.

## Review outcome

PASS. The replan is the smallest change that honors the user's request, preserves completed feature architecture/contracts, keeps acceptance last, and gives defects a deterministic pre-user-run owner and proof path.
