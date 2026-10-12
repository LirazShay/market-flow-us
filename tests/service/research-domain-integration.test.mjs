import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchDomain } from "../../research-server/domain.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const NOTE_ID = "note_11111111-1111-4111-8111-111111111111";
const NOW = 1_860_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

function advancingClock(start = NOW) {
  let current = start;
  return () => current++;
}

async function expectPublicSafeRejection(promise, forbiddenValue) {
  await assert.rejects(promise, (error) => {
    assert.match(error.message, /public-safe research data/u);
    assert.equal(error.message.includes(forbiddenValue), false);
    return true;
  });
}

test("TREE 11.1 composed Research Domain is restart-safe and rejects non-public-safe persistence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-domain-composed-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  try {
    domain = await openResearchDomain({
      dbPath,
      now: advancingClock(),
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: () => QUERY_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION]),
      noteIdFactory: () => NOTE_ID
    });

    assert.deepEqual(domain.schemaVersions, { ledger: 1, evidence: 1, memory: 1 });

    const browserSecret = "browser-session-secret-value";
    await expectPublicSafeRejection(
      domain.createResearchRun({
        userIntent: "Rejected run must never become durable.",
        environmentSnapshot: { browserSessionData: browserSecret }
      }),
      browserSecret
    );
    assert.deepEqual(await domain.listResearchRuns(), []);

    const run = await domain.createResearchRun({
      userIntent: "Find robust short-horizon upward momentum candidates.",
      budgetPolicy: { maxExperiments: 40 },
      environmentSnapshot: {
        productVersion: "0.1.0",
        schemaContractVersion: "research-contract-v1"
      }
    });
    assert.equal(run.researchRunId, RUN_ID);

    const hiddenReasoning = "private scratch reasoning";
    await expectPublicSafeRejection(
      domain.createObjectiveVersion({
        researchRunId: RUN_ID,
        interpretationText: "Rejected objective.",
        objective: {
          targetDirection: "UP",
          chainOfThought: hiddenReasoning
        }
      }),
      hiddenReasoning
    );
    assert.equal(await domain.getCurrentObjectiveVersion(RUN_ID), null);

    const objective = await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer positive 60s outcomes with independent validation.",
      objective: {
        targetDirection: "UP",
        primaryHorizonsSec: [60],
        selectionPolicy: "TOP_1",
        primaryMetric: "positiveOutcomeRate"
      }
    });
    assert.equal(objective.objectiveVersionId, OBJECTIVE_ID);

    const query = await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 1",
      scannerContractVersion: "scanner-authority-v1",
      label: "baseline"
    });
    assert.equal(query.queryArtifactId, QUERY_ID);

    const accountSecret = "account-123-private";
    await expectPublicSafeRejection(
      domain.createEvidenceInventory({
        researchRunId: RUN_ID,
        inventory: {
          sources: [{
            sourceId: "source_day_2026_10_01",
            sourceFingerprint: "a".repeat(64),
            accountId: accountSecret
          }]
        }
      }),
      accountSecret
    );
    assert.deepEqual(await domain.listEvidenceInventories(RUN_ID), []);

    const inventory = await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "source_day_2026_10_01",
          sourceFingerprint: "a".repeat(64),
          classification: "ARCHIVE",
          schemaVersion: 3
        }]
      }
    });
    assert.equal(inventory.evidenceInventoryId, INVENTORY_ID);

    const plan = await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: {
        algorithmVersion: "chronological-blocks-v1",
        purgeRule: "horizon-aware"
      },
      partitions: [
        {
          role: "DEVELOPMENT",
          partition: { sourceIds: ["source_day_2026_10_01"], block: "early" }
        },
        {
          role: "VALIDATION",
          partition: { sourceIds: ["source_day_2026_10_01"], block: "late" }
        }
      ]
    });
    assert.equal(plan.evidencePlanId, PLAN_ID);

    const authSecret = "Authorization: Bearer secret-token-value";
    await expectPublicSafeRejection(
      domain.recordResearchNote({
        researchRunId: RUN_ID,
        kind: "HYPOTHESIS",
        text: authSecret
      }),
      authSecret
    );
    assert.deepEqual(await domain.listResearchNotes(RUN_ID), []);

    const note = await domain.recordResearchNote({
      researchRunId: RUN_ID,
      kind: "DECISION",
      decision: "KEEP",
      text: "Keep the baseline query for authoritative historical comparison.",
      relatedRefs: [
        { type: "QUERY_ARTIFACT", id: QUERY_ID },
        { type: "EVIDENCE_PLAN", id: PLAN_ID }
      ]
    });
    assert.equal(note.noteId, NOTE_ID);

    const capsuleBeforeRestart = await domain.resumeResearchRun(RUN_ID);
    assert.equal(capsuleBeforeRestart.researchRunId, RUN_ID);
    assert.equal(capsuleBeforeRestart.currentObjective.objectiveVersionId, OBJECTIVE_ID);
    assert.equal(capsuleBeforeRestart.evidencePlan.evidencePlanId, PLAN_ID);
    assert.equal(capsuleBeforeRestart.lastDecision.noteId, NOTE_ID);
    assert.deepEqual(capsuleBeforeRestart.lastDecision.relatedRefs, [
      { type: "QUERY_ARTIFACT", id: QUERY_ID },
      { type: "EVIDENCE_PLAN", id: PLAN_ID }
    ]);

    await domain.close();
    domain = null;

    domain = await openResearchDomain({ dbPath, now: () => NOW + 10_000 });

    assert.deepEqual(await domain.getResearchRun(RUN_ID), run);
    assert.deepEqual(await domain.getCurrentObjectiveVersion(RUN_ID), objective);
    assert.deepEqual(await domain.getQueryArtifact(RUN_ID, QUERY_ID), query);
    assert.deepEqual(await domain.getEvidenceInventory(RUN_ID, INVENTORY_ID), inventory);
    assert.deepEqual(await domain.getEvidencePlan(RUN_ID, PLAN_ID), plan);
    assert.deepEqual(await domain.listResearchNotes(RUN_ID), [note]);
    assert.deepEqual(await domain.resumeResearchRun(RUN_ID), capsuleBeforeRestart);

    const publicState = JSON.stringify({
      runs: await domain.listResearchRuns(),
      objectives: await domain.listObjectiveVersions(RUN_ID),
      queries: await domain.listQueryArtifacts(RUN_ID),
      inventories: await domain.listEvidenceInventories(RUN_ID),
      plans: await domain.listEvidencePlans(RUN_ID),
      notes: await domain.listResearchNotes(RUN_ID),
      resume: await domain.resumeResearchRun(RUN_ID)
    });
    assert.equal(publicState.includes(browserSecret), false);
    assert.equal(publicState.includes(hiddenReasoning), false);
    assert.equal(publicState.includes(accountSecret), false);
    assert.equal(publicState.includes(authSecret), false);
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
