import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchEvidenceDomain } from "../../research-server/evidence-domain.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchMemory } from "../../research-server/research-memory.js";

const RUN_A = "run_11111111-1111-4111-8111-111111111111";
const RUN_B = "run_22222222-2222-4222-8222-222222222222";
const OBJECTIVE_A = "obj_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_B = "obj_22222222-2222-4222-8222-222222222222";
const QUERY_A = "qry_11111111-1111-4111-8111-111111111111";
const QUERY_B = "qry_22222222-2222-4222-8222-222222222222";
const INVENTORY_A = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_A = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const NOTE_1 = "note_11111111-1111-4111-8111-111111111111";
const NOTE_2 = "note_22222222-2222-4222-8222-222222222222";
const NOTE_3 = "note_33333333-3333-4333-8333-333333333333";
const NOTE_4 = "note_44444444-4444-4444-8444-444444444444";
const NOTE_5 = "note_55555555-5555-4555-8555-555555555555";
const NOTE_6 = "note_66666666-6666-4666-8666-666666666666";
const NOW = 1_840_000_000_000;

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

async function seedFoundation(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => NOW,
    idFactory: sequence([RUN_A, RUN_B]),
    objectiveVersionIdFactory: sequence([OBJECTIVE_A, OBJECTIVE_B]),
    queryArtifactIdFactory: sequence([QUERY_A, QUERY_B])
  });
  try {
    await ledger.createResearchRun({
      userIntent: "Find robust short-horizon upward momentum candidates.",
      budgetPolicy: { maxExperiments: 40 },
      environmentSnapshot: { productVersion: "0.1.0" }
    });
    await ledger.createResearchRun({
      userIntent: "Independent second research run.",
      budgetPolicy: { maxExperiments: 20 },
      environmentSnapshot: { productVersion: "0.1.0" }
    });
    await ledger.createObjectiveVersion({
      researchRunId: RUN_A,
      interpretationText: "Prefer positive 60s outcomes with independent validation.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [60] }
    });
    await ledger.createObjectiveVersion({
      researchRunId: RUN_B,
      interpretationText: "Independent objective.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [120] }
    });
    await ledger.createQueryArtifact({
      researchRunId: RUN_A,
      sqlText: "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 1",
      scannerContractVersion: "scanner-authority-v1"
    });
    await ledger.createQueryArtifact({
      researchRunId: RUN_B,
      sqlText: "SELECT security_id FROM latest ORDER BY Price ASC LIMIT 1",
      scannerContractVersion: "scanner-authority-v1"
    });
  } finally {
    await ledger.close();
  }

  const evidence = await openResearchEvidenceDomain({
    dbPath,
    now: () => NOW + 10,
    evidenceInventoryIdFactory: () => INVENTORY_A,
    evidencePlanIdFactory: () => PLAN_A,
    partitionIdFactory: sequence([PART_DEV, PART_VALIDATION])
  });
  try {
    await evidence.createEvidenceInventory({
      researchRunId: RUN_A,
      inventory: {
        sources: [{
          sourceId: "source_day_2026_10_01",
          sourceFingerprint: "a".repeat(64),
          classification: "ARCHIVE"
        }]
      }
    });
    await evidence.createEvidencePlan({
      researchRunId: RUN_A,
      objectiveVersionId: OBJECTIVE_A,
      evidenceInventoryId: INVENTORY_A,
      plan: { algorithmVersion: "chronological-blocks-v1" },
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
  } finally {
    await evidence.close();
  }
}

test("TREE 11.1 research notes remain concise/run-scoped and Resume Capsule survives a fresh connection", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-memory-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let memory = null;

  try {
    await seedFoundation(dbPath);
    memory = await openResearchMemory({
      dbPath,
      now: advancingClock(NOW + 100),
      noteIdFactory: sequence([NOTE_1, NOTE_2, NOTE_3, NOTE_4, NOTE_5, NOTE_6])
    });

    const hypothesis = await memory.recordResearchNote({
      researchRunId: RUN_A,
      kind: "HYPOTHESIS",
      text: "Price ordering is a baseline worth comparing, not a conclusion.",
      relatedRefs: [{ type: "QUERY_ARTIFACT", id: QUERY_A }]
    });
    const keep = await memory.recordResearchNote({
      researchRunId: RUN_A,
      kind: "DECISION",
      decision: "KEEP",
      text: "Keep the baseline for controlled comparison.",
      relatedRefs: [{ type: "QUERY_ARTIFACT", id: QUERY_A }]
    });
    const rejected = await memory.recordResearchNote({
      researchRunId: RUN_A,
      kind: "DECISION",
      decision: "REJECT",
      text: "Reject an unsupported threshold variant.",
      relatedRefs: [{ type: "OBJECTIVE_VERSION", id: OBJECTIVE_A }]
    });
    const limitation = await memory.recordResearchNote({
      researchRunId: RUN_A,
      kind: "LIMITATION",
      text: "Current evidence plan has no sealed holdout yet.",
      relatedRefs: [{ type: "EVIDENCE_PLAN", id: PLAN_A }]
    });
    const nextAction = await memory.recordResearchNote({
      researchRunId: RUN_A,
      kind: "NEXT_ACTION",
      text: "Run the retained query through authoritative historical experiments.",
      relatedRefs: [
        { type: "QUERY_ARTIFACT", id: QUERY_A },
        { type: "PARTITION", id: PART_DEV }
      ]
    });

    await assert.rejects(
      memory.recordResearchNote({
        researchRunId: RUN_A,
        kind: "HYPOTHESIS",
        text: "Do not persist hidden reasoning fields.",
        privateReasoning: "hidden chain of thought"
      }),
      /unsupported field privateReasoning/u
    );
    await assert.rejects(
      memory.recordResearchNote({
        researchRunId: RUN_A,
        kind: "DECISION",
        decision: "KEEP",
        text: "Cross-run references must fail closed.",
        relatedRefs: [{ type: "QUERY_ARTIFACT", id: QUERY_B }]
      }),
      /was not found in this Research Run/u
    );

    const capsule = await memory.resumeResearchRun(RUN_A);
    assert.deepEqual(capsule.mission, {
      userIntent: "Find robust short-horizon upward momentum candidates.",
      status: "ACTIVE",
      currentPhase: "DEVELOPMENT"
    });
    assert.equal(capsule.currentObjective.objectiveVersionId, OBJECTIVE_A);
    assert.equal(capsule.evidencePlan.evidencePlanId, PLAN_A);
    assert.deepEqual(
      capsule.evidencePlan.partitions.map(({ partitionId, role }) => ({ partitionId, role })),
      [
        { partitionId: PART_DEV, role: "DEVELOPMENT" },
        { partitionId: PART_VALIDATION, role: "VALIDATION" }
      ]
    );
    assert.equal(capsule.lastDecision.noteId, NOTE_3);
    assert.equal(capsule.nextAction.noteId, NOTE_5);
    assert.deepEqual(capsule.retainedDecisions.map((note) => note.noteId), [NOTE_2]);
    assert.deepEqual(capsule.rejectedDecisions.map((note) => note.noteId), [NOTE_3]);
    assert.deepEqual(capsule.knownFailures.map((note) => note.noteId), [NOTE_4]);
    assert.deepEqual(capsule.recentHypotheses.map((note) => note.noteId), [NOTE_1]);
    assert.deepEqual(capsule.budget, {
      policy: { maxExperiments: 40 },
      accountingAvailable: false,
      used: null,
      remaining: null
    });
    assert.deepEqual(capsule.stableReferences.partitionIds, [PART_DEV, PART_VALIDATION]);
    assert.equal(capsule.deeperRetrieval.researchNotes, true);

    const notesBeforeRestart = await memory.listResearchNotes(RUN_A);
    assert.equal(notesBeforeRestart.length, 5);
    assert.deepEqual(notesBeforeRestart[0], nextAction);
    assert.deepEqual(notesBeforeRestart[4], hypothesis);
    assert.equal(notesBeforeRestart.some((note) => "privateReasoning" in note), false);
    assert.equal(notesBeforeRestart.some((note) => note.noteId === NOTE_6), false);
    assert.equal(keep.decision, "KEEP");
    assert.equal(rejected.decision, "REJECT");
    assert.equal(limitation.kind, "LIMITATION");

    await memory.close();
    memory = null;

    memory = await openResearchMemory({ dbPath, now: () => NOW + 1_000 });
    assert.deepEqual(await memory.resumeResearchRun(RUN_A), capsule);
    assert.deepEqual(await memory.listResearchNotes(RUN_A), notesBeforeRestart);

    const secondRunCapsule = await memory.resumeResearchRun(RUN_B);
    assert.equal(secondRunCapsule.currentObjective.objectiveVersionId, OBJECTIVE_B);
    assert.equal(secondRunCapsule.evidencePlan, null);
    assert.deepEqual(secondRunCapsule.stableReferences.noteIds, []);
    assert.equal(secondRunCapsule.lastDecision, null);
  } finally {
    if (memory) await memory.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
