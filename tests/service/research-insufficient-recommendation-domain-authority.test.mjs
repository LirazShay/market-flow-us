import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchDomain } from "../../research-server/domain.js";

const RUN_ID = "run_dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OBJECTIVE_ID = "obj_dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INVENTORY_ID = "inv_dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ARTIFACT_ID = "artifact_dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SOURCE_ID = "archive:insufficient-finalization-fixture.duckdb";
const SOURCE_FINGERPRINT = "d".repeat(64);
const NOW = 1_895_000_000_000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function payloadHash(artifact) {
  const { artifactHash, ...payload } = artifact;
  return createHash("sha256").update(JSON.stringify(canonicalize(payload)), "utf8").digest("hex");
}

function evaluationProfile() {
  return {
    selectionPolicy: "TOP_N",
    topX: 3,
    horizonsMs: [10_000, 60_000],
    metricProfile: {
      contractVersion: "research-experiment-metrics-v1",
      primaryMetric: "positiveRate"
    },
    intervalValue: 1,
    intervalUnit: "seconds"
  };
}

async function seedInsufficientRun(domain, { lastCompleteAtMs = 30_000 } = {}) {
  await domain.createResearchRun({
    userIntent: "Find a defensible short-horizon Scanner query, or explicitly decline when independent evidence is impossible.",
    budgetPolicy: { maxExperiments: 40 },
    environmentSnapshot: { productVersion: "0.1.0" }
  });
  await domain.createObjectiveVersion({
    researchRunId: RUN_ID,
    interpretationText: "Require independent evidence for 10s and 60s outcomes.",
    objective: { targetDirection: "UP", primaryHorizonsSec: [10, 60] }
  });
  await domain.createEvidenceInventory({
    researchRunId: RUN_ID,
    inventory: {
      sources: [{
        sourceId: SOURCE_ID,
        sourceFingerprint: SOURCE_FINGERPRINT,
        classification: "ARCHIVE",
        schemaVersion: 4,
        firstCompleteAtMs: 1_000,
        lastCompleteAtMs,
        tradingDay: "2026-10-01"
      }]
    }
  });
}

function request() {
  return {
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    evidenceInventoryId: INVENTORY_ID,
    evaluationProfile: evaluationProfile(),
    timingToleranceMs: 0,
    outcome: "NO_RECOMMENDATION",
    stoppingReason: "The available chronology cannot support an independent Validation/Holdout split.",
    interpretation: "Preserve the evidence and terminate without claiming independent support.",
    limitations: ["No usable independent Holdout can be formed from the available chronological span."]
  };
}

test("TREE 11.5 insufficient independent evidence produces durable restart-safe NO_RECOMMENDATION without invented Holdout", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-insufficient-final-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let verificationCount = 0;

  try {
    domain = await openResearchDomain({
      dbPath,
      now: () => NOW,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      recommendationArtifactIdFactory: () => ARTIFACT_ID,
      marketDataDir: "server-owned-market-data",
      verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
        verificationCount += 1;
        assert.equal(sourceId, SOURCE_ID);
        assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
        return expectedFingerprint;
      }
    });
    await seedInsufficientRun(domain);

    const proposal = await domain.proposeEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      evaluationProfile: evaluationProfile(),
      timingToleranceMs: 0
    });
    assert.equal(proposal.status, "INSUFFICIENT_INDEPENDENT_EVIDENCE");
    assert.equal(proposal.reasonCode, "INSUFFICIENT_CHRONOLOGICAL_SPAN");

    const artifact = await domain.buildInsufficientEvidenceRecommendationArtifact(request());
    assert.equal(artifact.artifactId, ARTIFACT_ID);
    assert.equal(artifact.artifactHash, payloadHash(artifact));
    assert.equal(artifact.outcome, "NO_RECOMMENDATION");
    assert.equal(artifact.confidenceClassification, "INSUFFICIENT_FOR_RECOMMENDATION");
    assert.equal(artifact.finalistSetId, null);
    assert.equal(artifact.selectedQuery, null);
    assert.deepEqual(artifact.strongestCandidates, []);
    assert.equal(artifact.objective.objectiveVersionId, OBJECTIVE_ID);
    assert.match(artifact.objective.userIntent, /explicitly decline/u);
    assert.equal(artifact.evidence.evidenceInventoryId, INVENTORY_ID);
    assert.equal(artifact.evidence.evidencePlanId, null);
    assert.deepEqual(artifact.evidence.partitions, []);
    assert.equal(artifact.evidencePlanning.status, "INSUFFICIENT_INDEPENDENT_EVIDENCE");
    assert.equal(artifact.evidencePlanning.reasonCode, "INSUFFICIENT_CHRONOLOGICAL_SPAN");
    assert.equal(artifact.holdout.status, "NOT_AVAILABLE");
    assert.equal(artifact.holdout.holdoutEvaluationId, null);
    assert.equal(artifact.holdout.independentProofForSelectedQuery, false);
    assert.deepEqual(
      artifact.knownFailures,
      ["INSUFFICIENT_INDEPENDENT_EVIDENCE", "INSUFFICIENT_CHRONOLOGICAL_SPAN"]
    );
    assert.equal(artifact.reproductionReferences.finalistSetId, null);
    assert.equal(artifact.reproductionReferences.holdoutEvaluationId, null);
    assert.equal(verificationCount, 1);

    assert.deepEqual(await domain.buildInsufficientEvidenceRecommendationArtifact(request()), artifact);
    await assert.rejects(
      domain.buildInsufficientEvidenceRecommendationArtifact({
        ...request(),
        stoppingReason: "Conflicting terminal rationale."
      }),
      /already finalized with different terminal intent/u
    );
    assert.deepEqual(await domain.getRecommendationArtifact(RUN_ID), artifact);
    const run = await domain.getResearchRun(RUN_ID);
    assert.equal(run.status, "COMPLETED");
    assert.equal(run.currentPhase, "FINALIZATION");

    await domain.close();
    domain = await openResearchDomain({ dbPath, now: () => NOW + 1_000 });
    assert.deepEqual(await domain.getRecommendationArtifact(RUN_ID), artifact);
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.5 no-Holdout finalization cannot bypass a usable deterministic partition plan", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-insufficient-bypass-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  try {
    domain = await openResearchDomain({
      dbPath,
      now: () => NOW,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      recommendationArtifactIdFactory: () => ARTIFACT_ID,
      verifySourceFingerprint: async () => SOURCE_FINGERPRINT
    });
    await seedInsufficientRun(domain, { lastCompleteAtMs: 1_000_000 });
    const proposal = await domain.proposeEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      evaluationProfile: evaluationProfile()
    });
    assert.equal(proposal.status, "PROPOSED");

    await assert.rejects(
      domain.buildInsufficientEvidenceRecommendationArtifact(request()),
      /requires server-derived INSUFFICIENT_INDEPENDENT_EVIDENCE/u
    );
    assert.equal(await domain.getRecommendationArtifact(RUN_ID), null);
    assert.equal((await domain.getResearchRun(RUN_ID)).status, "ACTIVE");
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.5 insufficient finalization fails closed on evidence fingerprint drift", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-insufficient-drift-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  try {
    domain = await openResearchDomain({
      dbPath,
      now: () => NOW,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      recommendationArtifactIdFactory: () => ARTIFACT_ID,
      marketDataDir: "server-owned-market-data",
      verifySourceFingerprint: async () => {
        throw new Error("insufficient evidence source fingerprint drift fixture");
      }
    });
    await seedInsufficientRun(domain);

    await assert.rejects(
      domain.buildInsufficientEvidenceRecommendationArtifact(request()),
      /source fingerprint drift fixture/u
    );
    assert.equal(await domain.getRecommendationArtifact(RUN_ID), null);
    const run = await domain.getResearchRun(RUN_ID);
    assert.equal(run.status, "ACTIVE");
    assert.notEqual(run.currentPhase, "FINALIZATION");
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
