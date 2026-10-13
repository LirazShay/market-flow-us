import { DuckDBInstance } from "@duckdb/node-api";

import {
  resolveResearchDuckDbResourceLimits
} from "../backtest-lab/duckdb-resource-limits.js";
import { openBacktestEvidenceSource } from "../backtest-lab/evidence-source.js";
import {
  describeBacktestEvidenceSource,
  resolveBacktestEvidenceSourcePath
} from "../backtest-lab/source-catalog.js";
import { DUCKDB_HARDENING } from "../local-service/database/database.js";
import { createScannerAuthority } from "../local-service/scanner/scanner.js";
import {
  CONTROLLED_RESEARCH_SCHEMA_MANIFEST,
  materializeControlledResearchInputs
} from "./research-sql-controlled-inputs.js";
import { verifyResearchEvidenceSourceFingerprint } from "./source-fingerprint.js";

export const RESEARCH_DATA_SURFACE_VERSION = "research-data-surface-v1";

const SOURCE_FINGERPRINT = /^[0-9a-f]{64}$/u;
const MAX_SOURCE_COUNT = 512;
const DEVELOPMENT_PHASES = Object.freeze(["DEVELOPMENT"]);

function manifestField({
  column,
  type,
  nullable,
  origin,
  meaning,
  known_unit = null,
  identity_role = null,
  scanner_equivalent = null,
  decision_time_eligible = false,
  future_dependent = false,
  research_only = true,
  caveats = []
}) {
  return Object.freeze({
    column,
    type,
    nullable,
    origin,
    meaning,
    known_unit,
    identity_role,
    scanner_equivalent,
    decision_time_eligible,
    future_dependent,
    research_only,
    phase_availability: DEVELOPMENT_PHASES,
    caveats: Object.freeze([...caveats])
  });
}

function manifestRelation(relation, meaning, fields) {
  return Object.freeze({
    relation,
    meaning,
    fields: Object.freeze(fields.map((field) => manifestField(field)))
  });
}

const RESEARCH_SCHEMA_MANIFEST = Object.freeze({
  contract_version: "research-schema-manifest-v1",
  data_surface_version: RESEARCH_DATA_SURFACE_VERSION,
  relations: Object.freeze([
    manifestRelation("research_sources", "Logical immutable evidence sources projected into this sandbox.", [
      { column: "source_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Stable logical evidence source identity.", identity_role: "source" },
      { column: "source_fingerprint", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "SHA-256 fingerprint bound by the Evidence Inventory.", identity_role: "source_fingerprint" },
      { column: "schema_version", type: "INTEGER", nullable: false, origin: "provenance", meaning: "Validated Market Flow US source schema version." },
      { column: "source_class", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Evidence Inventory source classification." },
      { column: "first_complete_at_ms", type: "BIGINT", nullable: true, origin: "authority_derived", meaning: "First included complete cycle commit time.", known_unit: "milliseconds" },
      { column: "last_complete_at_ms", type: "BIGINT", nullable: true, origin: "authority_derived", meaning: "Last included complete cycle commit time.", known_unit: "milliseconds" },
      { column: "complete_cycle_count", type: "BIGINT", nullable: false, origin: "authority_derived", meaning: "Number of included complete cycles." },
      { column: "min_universe_size", type: "BIGINT", nullable: true, origin: "authority_derived", meaning: "Minimum source-reported unique count across included complete cycles." },
      { column: "max_universe_size", type: "BIGINT", nullable: true, origin: "authority_derived", meaning: "Maximum source-reported unique count across included complete cycles." }
    ]),
    manifestRelation("research_partition", "Server-authorized Development partition metadata for each projected source.", [
      { column: "partition_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Stable Evidence Plan partition identity.", identity_role: "partition" },
      { column: "partition_role", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Research evidence role; this surface currently admits Development only." },
      { column: "evidence_plan_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Owning Evidence Plan identity.", identity_role: "evidence_plan" },
      { column: "source_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Logical evidence source identity.", identity_role: "source" },
      { column: "allowed_from_ms", type: "BIGINT", nullable: true, origin: "provenance", meaning: "Inclusive lower commit-time bound for this source.", known_unit: "milliseconds" },
      { column: "allowed_to_ms", type: "BIGINT", nullable: true, origin: "provenance", meaning: "Inclusive upper commit-time bound for this source.", known_unit: "milliseconds" },
      { column: "max_authorized_horizon_ms", type: "BIGINT", nullable: true, origin: "provenance", meaning: "Maximum horizon authorized by the partition when supplied.", known_unit: "milliseconds" }
    ]),
    manifestRelation("research_cycles", "Complete authoritative cycle timing and coverage facts inside the authorized partition.", [
      { column: "source_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Logical evidence source identity.", identity_role: "source" },
      { column: "cycle_id", type: "BIGINT", nullable: false, origin: "provenance", meaning: "Source-local authoritative cycle identity.", identity_role: "source_cycle" },
      { column: "universe_revision", type: "BIGINT", nullable: true, origin: "source_typed", meaning: "Persisted source universe revision." },
      { column: "started_at_ms", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Local cycle start time.", known_unit: "milliseconds" },
      { column: "completed_at_ms", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Local cycle completion time.", known_unit: "milliseconds" },
      { column: "committed_at_ms", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Successful local commit authority time.", known_unit: "milliseconds" },
      { column: "duration_ms", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Persisted cycle duration.", known_unit: "milliseconds" },
      { column: "requested", type: "BIGINT", nullable: true, origin: "source_typed", meaning: "Source-reported requested row count." },
      { column: "received", type: "BIGINT", nullable: true, origin: "source_typed", meaning: "Source-reported received row count." },
      { column: "unique_count", type: "BIGINT", nullable: true, origin: "source_typed", meaning: "Source-reported unique row count." },
      { column: "missing", type: "BIGINT", nullable: true, origin: "source_typed", meaning: "Persisted missing-row diagnostic count." },
      { column: "duplicates", type: "BIGINT", nullable: true, origin: "source_typed", meaning: "Persisted duplicate-row diagnostic count." },
      { column: "unexpected", type: "BIGINT", nullable: true, origin: "source_typed", meaning: "Persisted unexpected-row diagnostic count." }
    ]),
    manifestRelation("research_history", "Authorized successful market observations across one or more logical sources.", [
      { column: "source_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Logical evidence source identity.", identity_role: "source" },
      { column: "cycle_id", type: "BIGINT", nullable: false, origin: "provenance", meaning: "Source-local cycle identity.", identity_role: "source_cycle", scanner_equivalent: "history.cycle_id / latest.cycle_id", decision_time_eligible: true, research_only: false },
      { column: "universe_revision", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Persisted source universe revision.", scanner_equivalent: "history.universe_revision / latest.universe_revision", decision_time_eligible: true, research_only: false },
      { column: "security_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Canonical Market Flow US security identity.", identity_role: "canonical_security", scanner_equivalent: "history.security_id / latest.security_id", decision_time_eligible: true, research_only: false },
      { column: "collected_at_ms", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Local market-row collection time.", known_unit: "milliseconds", scanner_equivalent: "history.collected_at_ms / latest.collected_at_ms", decision_time_eligible: true, research_only: false },
      { column: "cycle_committed_at_ms", type: "BIGINT", nullable: false, origin: "authority_derived", meaning: "Successful local cycle commit authority time joined from the complete cycle.", known_unit: "milliseconds" },
      { column: "Symbol", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Provider-shaped symbol display field.", scanner_equivalent: "history.Symbol / latest.Symbol", decision_time_eligible: true, research_only: false },
      { column: "PaperNameEng", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Provider-shaped English paper name.", scanner_equivalent: "history.PaperNameEng / latest.PaperNameEng", decision_time_eligible: true, research_only: false },
      { column: "PaperNameHeb", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Provider-shaped Hebrew paper name.", scanner_equivalent: "history.PaperNameHeb / latest.PaperNameHeb", decision_time_eligible: true, research_only: false },
      { column: "ExchangeName", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Provider-shaped exchange display field.", scanner_equivalent: "history.ExchangeName / latest.ExchangeName", decision_time_eligible: true, research_only: false },
      { column: "TradeDateTime", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Provider-delivered time string with intentionally unstrengthened semantics.", scanner_equivalent: "history.TradeDateTime / latest.TradeDateTime", decision_time_eligible: true, research_only: false, caveats: ["Provider time semantics and timezone are not strengthened by the product."] },
      { column: "CountryName", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Provider-shaped country display field.", scanner_equivalent: "history.CountryName / latest.CountryName", decision_time_eligible: true, research_only: false },
      { column: "CountryNameEng", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Provider-shaped English country display field.", scanner_equivalent: "history.CountryNameEng / latest.CountryNameEng", decision_time_eligible: true, research_only: false },
      { column: "Price", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named Price; exact stronger market semantics are intentionally not asserted.", scanner_equivalent: "history.Price / latest.Price", decision_time_eligible: true, research_only: false },
      { column: "ChangePercent", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named ChangePercent.", scanner_equivalent: "history.ChangePercent / latest.ChangePercent", decision_time_eligible: true, research_only: false },
      { column: "DailyHigh", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named DailyHigh.", scanner_equivalent: "history.DailyHigh / latest.DailyHigh", decision_time_eligible: true, research_only: false },
      { column: "DailyLow", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named DailyLow.", scanner_equivalent: "history.DailyLow / latest.DailyLow", decision_time_eligible: true, research_only: false },
      { column: "YearHigh", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named YearHigh.", scanner_equivalent: "history.YearHigh / latest.YearHigh", decision_time_eligible: true, research_only: false },
      { column: "YearLow", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named YearLow.", scanner_equivalent: "history.YearLow / latest.YearLow", decision_time_eligible: true, research_only: false },
      { column: "DailyVolume", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named DailyVolume.", scanner_equivalent: "history.DailyVolume / latest.DailyVolume", decision_time_eligible: true, research_only: false },
      { column: "BeginYearChangePercent", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named BeginYearChangePercent.", scanner_equivalent: "history.BeginYearChangePercent / latest.BeginYearChangePercent", decision_time_eligible: true, research_only: false },
      { column: "Month12ChangePercent", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named Month12ChangePercent.", scanner_equivalent: "history.Month12ChangePercent / latest.Month12ChangePercent", decision_time_eligible: true, research_only: false },
      { column: "Month36ChangePercent", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named Month36ChangePercent.", scanner_equivalent: "history.Month36ChangePercent / latest.Month36ChangePercent", decision_time_eligible: true, research_only: false },
      { column: "AskRate", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named AskRate.", scanner_equivalent: "history.AskRate / latest.AskRate", decision_time_eligible: true, research_only: false },
      { column: "BidRate", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named BidRate.", scanner_equivalent: "history.BidRate / latest.BidRate", decision_time_eligible: true, research_only: false },
      { column: "YesterdayRate", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named YesterdayRate.", scanner_equivalent: "history.YesterdayRate / latest.YesterdayRate", decision_time_eligible: true, research_only: false },
      { column: "PaperMarketCap", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named PaperMarketCap.", scanner_equivalent: "history.PaperMarketCap / latest.PaperMarketCap", decision_time_eligible: true, research_only: false },
      { column: "PaperIdYatab", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named PaperIdYatab; it is not canonical security identity.", scanner_equivalent: "history.PaperIdYatab / latest.PaperIdYatab", decision_time_eligible: true, research_only: false },
      { column: "CountryId", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named CountryId.", scanner_equivalent: "history.CountryId / latest.CountryId", decision_time_eligible: true, research_only: false },
      { column: "PaperType", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named PaperType.", scanner_equivalent: "history.PaperType / latest.PaperType", decision_time_eligible: true, research_only: false },
      { column: "ESGRatingId", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named ESGRatingId.", scanner_equivalent: "history.ESGRatingId / latest.ESGRatingId", decision_time_eligible: true, research_only: false },
      { column: "ESGScope", type: "DOUBLE", nullable: true, origin: "source_typed", meaning: "Provider field named ESGScope.", scanner_equivalent: "history.ESGScope / latest.ESGScope", decision_time_eligible: true, research_only: false },
      { column: "raw_data", type: "JSON", nullable: false, origin: "source_raw", meaning: "Persisted provider market-row JSON for discovery of fields not yet promoted to the typed projection.", scanner_equivalent: "history.raw_data / latest.raw_data", decision_time_eligible: true, research_only: false, caveats: ["Provider-shaped JSON; key meanings and units may be unverified.", "Missing, null, empty-string and numeric-zero source facts may differ and must not be conflated."] }
    ]),
    manifestRelation("research_universe", "Source-persisted universe lifecycle/display context for securities present in the authorized research partition; not exact historical T0 membership.", [
      { column: "source_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Logical evidence source identity.", identity_role: "source" },
      { column: "security_id", type: "VARCHAR", nullable: false, origin: "provenance", meaning: "Canonical Market Flow US security identity.", identity_role: "canonical_security" },
      { column: "is_current", type: "BOOLEAN", nullable: false, origin: "source_typed", meaning: "Persisted source-universe current-lifecycle flag.", future_dependent: true, caveats: ["Source lifecycle state is not exact historical membership at an arbitrary decision T0; use authoritative baseline history for that question."] },
      { column: "universe_revision", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Persisted source-universe lifecycle revision.", future_dependent: true, caveats: ["May reflect source lifecycle state after a historical decision T0."] },
      { column: "first_seen_at_ms", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Persisted source-universe first-seen lifecycle time.", known_unit: "milliseconds", future_dependent: true, caveats: ["Lifecycle context is source-persisted and is not partition-local decision-time authority."] },
      { column: "last_seen_at_ms", type: "BIGINT", nullable: false, origin: "source_typed", meaning: "Persisted source-universe last-seen lifecycle time.", known_unit: "milliseconds", future_dependent: true, caveats: ["Lifecycle context may extend beyond a historical decision T0 or partition time bound."] },
      { column: "Symbol", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Persisted source-universe symbol display field.", future_dependent: true, caveats: ["Display value may reflect a later source-universe update than a historical decision T0."] },
      { column: "PaperNameEng", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Persisted source-universe English paper name.", future_dependent: true, caveats: ["Display value may reflect a later source-universe update than a historical decision T0."] },
      { column: "PaperNameHeb", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Persisted source-universe Hebrew paper name.", future_dependent: true, caveats: ["Display value may reflect a later source-universe update than a historical decision T0."] },
      { column: "ExchangeName", type: "VARCHAR", nullable: true, origin: "source_typed", meaning: "Persisted source-universe exchange display field.", future_dependent: true, caveats: ["Display value may reflect a later source-universe update than a historical decision T0."] }
    ])
  ])
});

const CONTROLLED_RELATION_MEANINGS = Object.freeze({
  research_decision_points: "Server-controlled Development decision points resolved by proven Backtest baseline authority.",
  research_authoritative_outcomes: "Server-controlled authoritative outcome labels; future-derived fields are explicit and never decision-time predictors.",
  experiment_points: "Explicitly referenced authoritative Experiment point results.",
  experiment_candidates: "Explicitly referenced authoritative Experiment candidate selections.",
  experiment_outcomes: "Explicitly referenced authoritative Experiment outcome labels.",
  experiment_metrics: "Normalized metric evidence from explicitly referenced authoritative Experiments."
});

const RESEARCH_SCHEMA_WITH_CONTROLLED_INPUTS = Object.freeze({
  ...RESEARCH_SCHEMA_MANIFEST,
  relations: Object.freeze([
    ...RESEARCH_SCHEMA_MANIFEST.relations,
    ...CONTROLLED_RESEARCH_SCHEMA_MANIFEST.relations.map((relation) => Object.freeze({
      relation: relation.relation,
      meaning: CONTROLLED_RELATION_MEANINGS[relation.relation],
      fields: Object.freeze(relation.fields.map((field) => Object.freeze({
        ...field,
        meaning: field.meaning ?? `Server-controlled ${relation.relation}.${field.column} field.`,
        identity_role: field.identity_role ?? null
      })))
    }))
  ])
});

const CREATE_RESEARCH_TABLES = Object.freeze([
  `CREATE TABLE research_sources (
    source_id VARCHAR PRIMARY KEY,
    source_fingerprint VARCHAR NOT NULL,
    schema_version INTEGER NOT NULL,
    source_class VARCHAR NOT NULL,
    first_complete_at_ms BIGINT NULL,
    last_complete_at_ms BIGINT NULL,
    complete_cycle_count BIGINT NOT NULL,
    min_universe_size BIGINT NULL,
    max_universe_size BIGINT NULL
  )`,
  `CREATE TABLE research_partition (
    partition_id VARCHAR NOT NULL,
    partition_role VARCHAR NOT NULL,
    evidence_plan_id VARCHAR NOT NULL,
    source_id VARCHAR NOT NULL,
    allowed_from_ms BIGINT NULL,
    allowed_to_ms BIGINT NULL,
    max_authorized_horizon_ms BIGINT NULL,
    PRIMARY KEY (partition_id, source_id)
  )`,
  `CREATE TABLE research_cycles (
    source_id VARCHAR NOT NULL,
    cycle_id BIGINT NOT NULL,
    universe_revision BIGINT NULL,
    started_at_ms BIGINT NOT NULL,
    completed_at_ms BIGINT NOT NULL,
    committed_at_ms BIGINT NOT NULL,
    duration_ms BIGINT NOT NULL,
    requested BIGINT NULL,
    received BIGINT NULL,
    unique_count BIGINT NULL,
    missing BIGINT NULL,
    duplicates BIGINT NULL,
    unexpected BIGINT NULL,
    PRIMARY KEY (source_id, cycle_id)
  )`,
  `CREATE TABLE research_history (
    source_id VARCHAR NOT NULL,
    cycle_id BIGINT NOT NULL,
    universe_revision BIGINT NOT NULL,
    security_id VARCHAR NOT NULL,
    collected_at_ms BIGINT NOT NULL,
    cycle_committed_at_ms BIGINT NOT NULL,
    Symbol VARCHAR NULL,
    PaperNameEng VARCHAR NULL,
    PaperNameHeb VARCHAR NULL,
    ExchangeName VARCHAR NULL,
    TradeDateTime VARCHAR NULL,
    CountryName VARCHAR NULL,
    CountryNameEng VARCHAR NULL,
    Price DOUBLE NULL,
    ChangePercent DOUBLE NULL,
    DailyHigh DOUBLE NULL,
    DailyLow DOUBLE NULL,
    YearHigh DOUBLE NULL,
    YearLow DOUBLE NULL,
    DailyVolume DOUBLE NULL,
    BeginYearChangePercent DOUBLE NULL,
    Month12ChangePercent DOUBLE NULL,
    Month36ChangePercent DOUBLE NULL,
    AskRate DOUBLE NULL,
    BidRate DOUBLE NULL,
    YesterdayRate DOUBLE NULL,
    PaperMarketCap DOUBLE NULL,
    PaperIdYatab DOUBLE NULL,
    CountryId DOUBLE NULL,
    PaperType DOUBLE NULL,
    ESGRatingId DOUBLE NULL,
    ESGScope DOUBLE NULL,
    raw_data JSON NOT NULL,
    PRIMARY KEY (source_id, cycle_id, security_id)
  )`,
  `CREATE TABLE research_universe (
    source_id VARCHAR NOT NULL,
    security_id VARCHAR NOT NULL,
    is_current BOOLEAN NOT NULL,
    universe_revision BIGINT NOT NULL,
    first_seen_at_ms BIGINT NOT NULL,
    last_seen_at_ms BIGINT NOT NULL,
    Symbol VARCHAR NULL,
    PaperNameEng VARCHAR NULL,
    PaperNameHeb VARCHAR NULL,
    ExchangeName VARCHAR NULL,
    PRIMARY KEY (source_id, security_id)
  )`
]);

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertBoundedId(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256) {
    throw new TypeError(`${label} must be a bounded non-empty string`);
  }
  return value;
}

function optionalNonNegativeSafeInteger(value, label) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer or null`);
  }
  return value;
}

function normalizePartition(partition) {
  assertObject(partition, "partition");
  if (partition.role !== "DEVELOPMENT") {
    throw new Error("General research SQL is currently authorized only for DEVELOPMENT partitions");
  }
  const partitionId = assertBoundedId(partition.partitionId, "partition.partitionId");
  const evidencePlanId = assertBoundedId(partition.evidencePlanId, "partition.evidencePlanId");
  const definition = assertObject(partition.partition, "partition.partition");
  if (
    !Array.isArray(definition.sourceIds)
    || definition.sourceIds.length < 1
    || definition.sourceIds.length > MAX_SOURCE_COUNT
  ) {
    throw new TypeError(`partition.partition.sourceIds must contain 1..${MAX_SOURCE_COUNT} logical source IDs`);
  }
  const sourceIds = [];
  const seen = new Set();
  for (const sourceId of definition.sourceIds) {
    assertBoundedId(sourceId, "partition sourceId");
    if (seen.has(sourceId)) throw new TypeError("partition sourceIds must be unique");
    seen.add(sourceId);
    sourceIds.push(sourceId);
  }

  const range = definition.range === undefined || definition.range === null
    ? null
    : assertObject(definition.range, "partition.partition.range");
  const allowedFromMs = optionalNonNegativeSafeInteger(range?.fromMs, "partition range.fromMs");
  const allowedToMs = optionalNonNegativeSafeInteger(range?.toMs, "partition range.toMs");
  if (allowedFromMs !== null && allowedToMs !== null && allowedFromMs > allowedToMs) {
    throw new TypeError("partition range.fromMs must be <= range.toMs");
  }
  const maxAuthorizedHorizonMs = optionalNonNegativeSafeInteger(
    definition.maxAuthorizedHorizonMs,
    "partition maxAuthorizedHorizonMs"
  );

  return Object.freeze({
    partitionId,
    evidencePlanId,
    sourceIds: Object.freeze(sourceIds),
    allowedFromMs,
    allowedToMs,
    maxAuthorizedHorizonMs
  });
}

function boundInventorySources(inventory, sourceIds) {
  assertObject(inventory, "inventory");
  const inventoryBody = assertObject(inventory.inventory, "inventory.inventory");
  if (!Array.isArray(inventoryBody.sources) || inventoryBody.sources.length > MAX_SOURCE_COUNT) {
    throw new TypeError(`inventory.inventory.sources must contain at most ${MAX_SOURCE_COUNT} sources`);
  }

  return Object.freeze(sourceIds.map((sourceId) => {
    const matches = inventoryBody.sources.filter((source) => source?.sourceId === sourceId);
    if (matches.length !== 1) {
      throw new Error("Research SQL source must be present exactly once in the bound Evidence Inventory");
    }
    const source = assertObject(matches[0], "inventory source");
    if (typeof source.sourceFingerprint !== "string" || !SOURCE_FINGERPRINT.test(source.sourceFingerprint)) {
      throw new TypeError("inventory sourceFingerprint must be a SHA-256 value");
    }
    if (
      source.schemaVersion !== undefined
      && (!Number.isSafeInteger(source.schemaVersion) || source.schemaVersion < 1)
    ) {
      throw new TypeError("inventory source schemaVersion must be a positive safe integer when supplied");
    }
    if (
      source.classification !== undefined
      && (typeof source.classification !== "string" || source.classification.length < 1 || source.classification.length > 64)
    ) {
      throw new TypeError("inventory source classification must be a bounded non-empty string when supplied");
    }
    return Object.freeze({
      sourceId,
      sourceFingerprint: source.sourceFingerprint,
      schemaVersion: source.schemaVersion ?? null,
      classification: source.classification ?? null
    });
  }));
}

function sqlStringLiteral(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError("internal SQL path literal must be a non-empty string without NUL");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

async function createResearchTables(connection) {
  for (const statement of CREATE_RESEARCH_TABLES) {
    await connection.run(statement);
  }
}

async function insertPartitionMetadata(connection, partition, source) {
  await connection.run(
    `INSERT INTO research_partition VALUES (
      $partitionId, 'DEVELOPMENT', $evidencePlanId, $sourceId,
      $allowedFromMs, $allowedToMs, $maxAuthorizedHorizonMs
    )`,
    {
      partitionId: partition.partitionId,
      evidencePlanId: partition.evidencePlanId,
      sourceId: source.sourceId,
      allowedFromMs: partition.allowedFromMs,
      allowedToMs: partition.allowedToMs,
      maxAuthorizedHorizonMs: partition.maxAuthorizedHorizonMs
    }
  );
}

async function projectAttachedSource(connection, partition, source) {
  const bounds = {
    sourceId: source.sourceId,
    allowedFromMs: partition.allowedFromMs,
    allowedToMs: partition.allowedToMs
  };

  await connection.run(
    `INSERT INTO research_cycles
     SELECT
       $sourceId,
       c.cycle_id,
       c.universe_revision,
       c.started_at_ms,
       c.completed_at_ms,
       c.committed_at_ms,
       c.duration_ms,
       c.requested,
       c.received,
       c.unique_count,
       c.missing,
       c.duplicates,
       c.unexpected
     FROM evidence.main.cycles AS c
     WHERE c.status = 'complete'
       AND ($allowedFromMs IS NULL OR c.committed_at_ms >= $allowedFromMs)
       AND ($allowedToMs IS NULL OR c.committed_at_ms <= $allowedToMs)`,
    bounds
  );

  await connection.run(
    `INSERT INTO research_history
     SELECT
       $sourceId,
       h.cycle_id,
       h.universe_revision,
       h.security_id,
       h.collected_at_ms,
       c.committed_at_ms,
       h.Symbol,
       h.PaperNameEng,
       h.PaperNameHeb,
       h.ExchangeName,
       h.TradeDateTime,
       h.CountryName,
       h.CountryNameEng,
       h.Price,
       h.ChangePercent,
       h.DailyHigh,
       h.DailyLow,
       h.YearHigh,
       h.YearLow,
       h.DailyVolume,
       h.BeginYearChangePercent,
       h.Month12ChangePercent,
       h.Month36ChangePercent,
       h.AskRate,
       h.BidRate,
       h.YesterdayRate,
       h.PaperMarketCap,
       h.PaperIdYatab,
       h.CountryId,
       h.PaperType,
       h.ESGRatingId,
       h.ESGScope,
       h.raw_data
     FROM evidence.main.history AS h
     JOIN evidence.main.cycles AS c ON c.cycle_id = h.cycle_id
     WHERE c.status = 'complete'
       AND ($allowedFromMs IS NULL OR c.committed_at_ms >= $allowedFromMs)
       AND ($allowedToMs IS NULL OR c.committed_at_ms <= $allowedToMs)`,
    bounds
  );

  await connection.run(
    `INSERT INTO research_universe
     SELECT
       $sourceId,
       u.security_id,
       u.is_current,
       u.universe_revision,
       u.first_seen_at_ms,
       u.last_seen_at_ms,
       u.Symbol,
       u.PaperNameEng,
       u.PaperNameHeb,
       u.ExchangeName
     FROM evidence.main.universe AS u
     WHERE EXISTS (
       SELECT 1
       FROM research_history AS h
       WHERE h.source_id = $sourceId
         AND h.security_id = u.security_id
     )`,
    { sourceId: source.sourceId }
  );
}

async function insertSourceSummary(connection, source, schemaVersion, sourceClass) {
  await connection.run(
    `INSERT INTO research_sources
     SELECT
       $sourceId,
       $sourceFingerprint,
       $schemaVersion,
       $sourceClass,
       MIN(committed_at_ms),
       MAX(committed_at_ms),
       COUNT(*),
       MIN(unique_count),
       MAX(unique_count)
     FROM research_cycles
     WHERE source_id = $sourceId`,
    {
      sourceId: source.sourceId,
      sourceFingerprint: source.sourceFingerprint,
      schemaVersion,
      sourceClass
    }
  );
}

async function applySandboxHardening(connection, resourceLimits) {
  await connection.run(`SET threads = ${resourceLimits.threads}`);
  await connection.run(`SET memory_limit = ${sqlStringLiteral(resourceLimits.memoryLimit)}`);
  await connection.run(
    `SET max_temp_directory_size = ${sqlStringLiteral(resourceLimits.maxTempDirectorySize)}`
  );
  for (const [name, value] of Object.entries(DUCKDB_HARDENING)) {
    await connection.run(`SET ${name} = ${value}`);
  }
  await connection.run("SET allowed_configs = []");
  await connection.run("SET lock_configuration = true");
}

async function readAppliedResourceLimits(connection) {
  const reader = await connection.runAndReadAll(`
    SELECT
      current_setting('threads') AS threads,
      current_setting('memory_limit') AS memory_limit,
      current_setting('max_temp_directory_size') AS max_temp_directory_size
  `);
  const rows = reader.getRowObjects();
  if (rows.length !== 1) {
    throw new Error("Research SQL DuckDB resource settings returned invalid cardinality");
  }
  return Object.freeze({
    threads: Number(rows[0].threads),
    memoryLimit: String(rows[0].memory_limit),
    maxTempDirectorySize: String(rows[0].max_temp_directory_size)
  });
}

function closeQuietly(value) {
  try {
    value?.closeSync();
  } catch {
    // Preserve the original projection failure.
  }
}

export function describeResearchSqlSchema({ includeControlledInputs = false } = {}) {
  return includeControlledInputs
    ? RESEARCH_SCHEMA_WITH_CONTROLLED_INPUTS
    : RESEARCH_SCHEMA_MANIFEST;
}

export async function openDevelopmentResearchSqlSandbox({
  dataDir,
  partition,
  inventory,
  controlledInputs,
  duckdbResourceLimits,
  now = () => Date.now(),
  verifySourceFingerprint = verifyResearchEvidenceSourceFingerprint
} = {}) {
  if (typeof dataDir !== "string" || dataDir.length === 0) {
    throw new TypeError("dataDir must be a non-empty server-owned path");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (typeof verifySourceFingerprint !== "function") {
    throw new TypeError("verifySourceFingerprint must be a function");
  }

  const resourceLimits = resolveResearchDuckDbResourceLimits(duckdbResourceLimits);
  const normalizedPartition = normalizePartition(partition);
  const sources = boundInventorySources(inventory, normalizedPartition.sourceIds);
  const includeControlledInputs = controlledInputs !== undefined;

  let instance = null;
  let connection = null;

  try {
    instance = await DuckDBInstance.create(":memory:");
    connection = await instance.connect();
    await createResearchTables(connection);

    for (const source of sources) {
      const verificationInput = {
        dataDir,
        sourceId: source.sourceId,
        expectedFingerprint: source.sourceFingerprint
      };
      await verifySourceFingerprint(verificationInput);

      const evidence = await openBacktestEvidenceSource({
        dataDir,
        sourceId: source.sourceId,
        duckdbResourceLimits: resourceLimits
      });
      let attached = false;
      try {
        if (source.schemaVersion !== null && source.schemaVersion !== evidence.schemaVersion) {
          throw new Error("Research SQL source schema no longer matches the bound Evidence Inventory");
        }

        const sourceDescription = describeBacktestEvidenceSource(source.sourceId);
        const sourceClass = source.classification ?? sourceDescription.kind.toUpperCase();
        const sourcePath = resolveBacktestEvidenceSourcePath({ dataDir, sourceId: source.sourceId });
        await insertPartitionMetadata(connection, normalizedPartition, source);
        await connection.run(
          `ATTACH ${sqlStringLiteral(sourcePath)} AS evidence (READ_ONLY, TYPE DUCKDB)`
        );
        attached = true;
        await projectAttachedSource(connection, normalizedPartition, source);
        await connection.run("DETACH evidence");
        attached = false;
        await insertSourceSummary(connection, source, evidence.schemaVersion, sourceClass);
      } finally {
        if (attached) {
          try {
            await connection.run("DETACH evidence");
          } catch {
            // The whole sandbox is discarded below if projection failed.
          }
        }
        await evidence.close();
      }

      await verifySourceFingerprint(verificationInput);
    }

    if (includeControlledInputs) {
      await materializeControlledResearchInputs({ connection, inputs: controlledInputs });
    }
    await applySandboxHardening(connection, resourceLimits);
    const appliedResourceLimits = await readAppliedResourceLimits(connection);

    const authority = await createScannerAuthority({ connection, now });
    const schemaManifest = describeResearchSqlSchema({ includeControlledInputs });
    let closed = false;

    return Object.freeze({
      dataSurfaceVersion: RESEARCH_DATA_SURFACE_VERSION,
      phase: "DEVELOPMENT",
      resourceLimits,
      appliedResourceLimits,
      describeSchema() {
        return schemaManifest;
      },
      async execute(sql) {
        if (closed) throw new Error("Research SQL sandbox is closed");
        return await authority.execute(sql);
      },
      interrupt() {
        if (closed) return;
        connection.interrupt();
      },
      async close() {
        if (closed) return;
        closed = true;
        connection.closeSync();
        instance.closeSync();
      }
    });
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }
}
