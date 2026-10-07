# CI Warning/Error RCA Policy

A CI warning or error is a mandatory investigation gate. Do not continue to the next implementation step merely because the immediate failing line was changed or the workflow became green.

Before progressing, complete a proportionate but end-to-end RCA:

1. **What happened?** Identify the exact warning/error, failing check, observed symptom, and affected state/path.
2. **Why did it happen?** Trace the causal chain to the underlying implementation, contract, process, synchronization, migration, test, tooling, or design weakness. Do not stop at the first broken line.
3. **Why was it not prevented or detected earlier?** Identify the missing invariant, validation, test, ownership rule, migration/update step, documentation, or other guardrail that allowed the issue to reach CI.
4. **How will recurrence be prevented?** Add or strengthen the smallest reusable prevention/detection mechanism that is practical. Do not rely only on remembering this incident.
5. **Where else could the same failure mode exist?** Search materially analogous code paths, validators, copied framework/planning files, workflows, scripts, tests, status projections, generated artifacts, integrations, or migrations for the same underlying weakness.
6. **What evidence closes the incident?** Verify the original CI signal is resolved, regression/prevention evidence exists, and the analogous-area search has no unresolved instances (or address every instance found).

## User-facing reporting

When CI emits a warning or error, explicitly tell the user that progression is paused for RCA and that a local symptom fix alone is not considered closure.

A concise report should include:

- the CI signal;
- the root cause;
- the escape/prevention gap;
- the systemic prevention added or strengthened;
- analogous areas checked and findings;
- verification evidence that closes the incident.

Only after those points are closed may implementation continue.

## Scope

This applies to **every CI warning or error**. Investigation depth is proportional to risk and complexity, but the requirement to understand root cause, recurrence prevention, and analogous exposure is not optional.

Normal local TDD red states before CI are not CI incidents. Once a warning/error is emitted by CI, this policy applies.
