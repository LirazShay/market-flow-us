import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_A = "run_11111111-1111-4111-8111-111111111111";
const RUN_B = "run_22222222-2222-4222-8222-222222222222";
const OBJECTIVE_1 = "obj_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_2 = "obj_22222222-2222-4222-8222-222222222222";
const QUERY_1 = "qry_11111111-1111-4111-8111-111111111111";
const QUERY_2 = "qry_22222222-2222-4222-8222-222222222222";
const QUERY_3 = "qry_33333333-3333-4333-8333-333333333333";
const NOW = 1_810_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test ID sequence exhausted");
    return remaining.shift();
  };
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function createRun(ledger, userIntent) {
  return await ledger.createResearchRun({
    userIntent,
    budgetPolicy: { maxExperiments: 40 },
    environmentSnapshot: { productVersion: "0.1.0" }
  });
}

test("TREE 11.1 Objective Versions are immutable numbered run-scoped facts and survive restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-objectives-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openResearchLedger({
      dbPath,
      now: () => NOW,
      idFactory: sequence([RUN_A, RUN_B]),
      objectiveVersionIdFactory: sequence([OBJECTIVE_1, OBJECTIVE_2])
    });
    await createRun(ledger, "Find robust short-horizon upward momentum candidates.");
    await createRun(ledger, "Independent second research run.");

    const first = await ledger.createObjectiveVersion({
      researchRunId: RUN_A,
      interpretationText: "Prefer positive 60s outcomes while limiting downside.",
      objective: {
        targetDirection: "UP",
        primaryHorizonsSec: [60],
        selectionPolicy: "TOP_1",
        primaryMetric: "positiveOutcomeRate"
      }
    });
    const second = await ledger.createObjectiveVersion({
      researchRunId: RUN_A,
      interpretationText: "Prefer positive 60s and 120s outcomes while limiting downside.",
      objective: {
        targetDirection: "UP",
        primaryHorizonsSec: [60, 120],
        selectionPolicy: "TOP_1",
        primaryMetric: "positiveOutcomeRate"
      }
    });

    assert.equal(first.objectiveVersionId, OBJECTIVE_1);
    assert.equal(first.versionNumber, 1);
    assert.match(first.objectiveHash, /^[0-9a-f]{64}$/u);
    assert.equal(second.objectiveVersionId, OBJECTIVE_2);
    assert.equal(second.versionNumber, 2);
    assert.notEqual(second.objectiveHash, first.objectiveHash);
    assert.deepEqual(await ledger.getObjectiveVersion(RUN_A, OBJECTIVE_1), first);
    assert.deepEqual(await ledger.getCurrentObjectiveVersion(RUN_A), second);
    assert.deepEqual(await ledger.listObjectiveVersions(RUN_A), [first, second]);

    assert.equal(await ledger.getObjectiveVersion(RUN_B, OBJECTIVE_1), null);
    assert.equal(await ledger.getCurrentObjectiveVersion(RUN_B), null);
    assert.deepEqual(await ledger.listObjectiveVersions(RUN_B), []);

    await ledger.close();
    ledger = null;

    ledger = await openResearchLedger({ dbPath, now: () => NOW + 1 });
    assert.deepEqual(await ledger.getObjectiveVersion(RUN_A, OBJECTIVE_1), first);
    assert.deepEqual(await ledger.getCurrentObjectiveVersion(RUN_A), second);
    assert.deepEqual(await ledger.listObjectiveVersions(RUN_A), [first, second]);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.1 Query Artifacts preserve exact SQL bytes/hash/lineage and reject cross-run references", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-queries-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const sql1 = "\nSELECT security_id, Price FROM latest ORDER BY Price DESC\n";
  const sql2 = "\nSELECT security_id, Price FROM latest ORDER BY Price DESC LIMIT 5\n";
  let ledger = null;

  try {
    ledger = await openResearchLedger({
      dbPath,
      now: () => NOW,
      idFactory: sequence([RUN_A, RUN_B]),
      queryArtifactIdFactory: sequence([QUERY_1, QUERY_2, QUERY_3])
    });
    await createRun(ledger, "Find robust short-horizon upward momentum candidates.");
    await createRun(ledger, "Independent second research run.");

    const first = await ledger.createQueryArtifact({
      researchRunId: RUN_A,
      sqlText: sql1,
      scannerContractVersion: "scanner-authority-v1",
      label: "price-order baseline",
      hypothesisText: "Use an exact SQL artifact as the baseline lineage root."
    });
    const second = await ledger.createQueryArtifact({
      researchRunId: RUN_A,
      sqlText: sql2,
      scannerContractVersion: "scanner-authority-v1",
      parentQueryArtifactId: QUERY_1,
      label: "bounded child"
    });

    assert.equal(first.sqlText, sql1);
    assert.equal(first.sqlHash, sha256(sql1));
    assert.equal(second.sqlText, sql2);
    assert.equal(second.sqlHash, sha256(sql2));
    assert.notEqual(second.sqlHash, first.sqlHash);
    assert.equal(second.parentQueryArtifactId, QUERY_1);
    assert.deepEqual(await ledger.getQueryArtifact(RUN_A, QUERY_1), first);
    assert.deepEqual(await ledger.listQueryArtifacts(RUN_A), [first, second]);

    assert.equal(await ledger.getQueryArtifact(RUN_B, QUERY_1), null);
    await assert.rejects(
      ledger.createQueryArtifact({
        researchRunId: RUN_B,
        sqlText: "SELECT 1",
        scannerContractVersion: "scanner-authority-v1",
        parentQueryArtifactId: QUERY_1
      }),
      /Parent query artifact was not found in this Research Run/u
    );
    assert.deepEqual(await ledger.listQueryArtifacts(RUN_B), []);

    await assert.rejects(
      ledger.createQueryArtifact({
        researchRunId: RUN_A,
        sqlText: "   \n\t",
        scannerContractVersion: "scanner-authority-v1"
      }),
      /sqlText/u
    );

    await ledger.close();
    ledger = null;

    ledger = await openResearchLedger({ dbPath, now: () => NOW + 1 });
    assert.deepEqual(await ledger.getQueryArtifact(RUN_A, QUERY_1), first);
    assert.deepEqual(await ledger.getQueryArtifact(RUN_A, QUERY_2), second);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
