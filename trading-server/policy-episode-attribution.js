import { createEpisodeAttribution } from "./policy-distillation.js";

const SUPERVISOR_SNAPSHOT_KIND = "TRADING_SUPERVISOR_V1";
const ENTRY_DECISIONS = new Set(["ENTER", "SKIP", "SWITCH"]);
const POSITION_DECISIONS = new Set(["HOLD", "EXIT"]);
const POSITION_OPEN_STATES = new Set(["POSITION_OPEN", "EXIT_PENDING", "EXIT_WORKING"]);
const MAX_REF_CHARS = 512;

function invalid(message) {
  throw new TypeError(message);
}

function boundedRef(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_REF_CHARS) {
    throw new Error("derived attribution evidence reference is invalid");
  }
  return value;
}

function evidenceRef(kind, id) {
  return boundedRef(`${kind}:${id}`);
}

function episodeProvenanceRef(tradeEpisodeId) {
  return boundedRef(`trade-episode:${tradeEpisodeId}:candidate-provenance`);
}

function layer(outcome, evidenceRefs = []) {
  return Object.freeze({ outcome, evidenceRefs: Object.freeze([...new Set(evidenceRefs)].sort()) });
}

function supervisorLifecycle(positionState) {
  const value = positionState?.state;
  if (
    value?.kind !== SUPERVISOR_SNAPSHOT_KIND
    || value?.version !== 1
    || typeof value?.supervisorState?.lifecycleState !== "string"
  ) {
    return null;
  }
  return value.supervisorState.lifecycleState;
}

function decisionLifecycleBefore(decision) {
  return typeof decision?.evidence?.lifecycleStateBefore === "string"
    ? decision.evidence.lifecycleStateBefore
    : null;
}

function refsForDecisions(decisions) {
  return decisions.map((decision) => evidenceRef("decision", decision.decisionRecordId));
}

function refsForPositions(positionStates) {
  return positionStates.map((position) => evidenceRef("position-state", position.positionStateId));
}

function refsForOrders(orderReferences) {
  return orderReferences.map((order) => evidenceRef("order-reference", order.orderReferenceId));
}

function normalizeCompletedBundle(bundle) {
  if (bundle === null || typeof bundle !== "object" || Array.isArray(bundle)) {
    invalid("Trade Episode bundle is required");
  }
  if (!bundle.episode || typeof bundle.episode !== "object") invalid("Trade Episode bundle episode is required");
  if (bundle.episode.lifecycleState !== "COMPLETED" || !Number.isSafeInteger(bundle.episode.completedAtMs)) {
    throw new Error("Policy attribution requires a completed Trade Episode");
  }
  if (!bundle.outcome || typeof bundle.outcome !== "object") {
    throw new Error("Completed Trade Episode requires a durable outcome");
  }
  for (const field of ["decisions", "orderReferences", "positionStates"]) {
    if (!Array.isArray(bundle[field])) invalid(`Trade Episode bundle ${field} must be an array`);
  }
  return bundle;
}

function scannerAttribution(bundle) {
  const refs = [
    episodeProvenanceRef(bundle.episode.tradeEpisodeId),
    evidenceRef("episode-outcome", bundle.outcome.episodeOutcomeId)
  ];
  const favorableMovePct = bundle.outcome?.outcome?.favorableMovePct;
  if (typeof favorableMovePct !== "number" || !Number.isFinite(favorableMovePct)) {
    return layer("INCONCLUSIVE", refs);
  }
  return layer(favorableMovePct > 0 ? "SUCCESS" : "FAILURE", refs);
}

function entryAttribution(bundle, scanner) {
  const entryDecisions = bundle.decisions.filter((decision) => ENTRY_DECISIONS.has(decision.decisionType));
  const refs = [
    ...scanner.evidenceRefs,
    ...refsForDecisions(entryDecisions)
  ];
  if (entryDecisions.length !== 1) return layer("INCONCLUSIVE", refs.length > 0 ? refs : [episodeProvenanceRef(bundle.episode.tradeEpisodeId)]);
  if (scanner.outcome !== "SUCCESS" && scanner.outcome !== "FAILURE") return layer("INCONCLUSIVE", refs);

  const tookCandidate = entryDecisions[0].decisionType === "ENTER";
  const correct = scanner.outcome === "SUCCESS" ? tookCandidate : !tookCandidate;
  return layer(correct ? "SUCCESS" : "FAILURE", refs);
}

function fillAttribution(bundle) {
  const entryDecisions = bundle.decisions.filter((decision) => decision.decisionType === "ENTER");
  if (entryDecisions.length === 0) return layer("NOT_APPLICABLE");

  const positionStates = bundle.positionStates.filter((position) => {
    const lifecycleState = supervisorLifecycle(position);
    return lifecycleState !== null;
  });
  const positionOpened = positionStates.some((position) => POSITION_OPEN_STATES.has(supervisorLifecycle(position)));
  const refs = [
    ...refsForDecisions(entryDecisions),
    ...refsForOrders(bundle.orderReferences),
    ...refsForPositions(positionStates),
    evidenceRef("episode-outcome", bundle.outcome.episodeOutcomeId)
  ];
  return layer(positionOpened ? "SUCCESS" : "FAILURE", refs);
}

function positionManagementAttribution(bundle, fill) {
  if (fill.outcome !== "SUCCESS") return layer("NOT_APPLICABLE");
  const managementDecisions = bundle.decisions.filter((decision) => (
    POSITION_DECISIONS.has(decision.decisionType)
    && decisionLifecycleBefore(decision) === "POSITION_OPEN"
  ));
  const refs = [
    ...fill.evidenceRefs,
    ...refsForDecisions(managementDecisions),
    evidenceRef("episode-outcome", bundle.outcome.episodeOutcomeId)
  ];

  // Durable state proves that management occurred, but without a separate management-quality
  // outcome it cannot be disentangled from exit timing or realized PnL.
  return layer("INCONCLUSIVE", refs);
}

function exitAttribution(bundle, fill) {
  if (fill.outcome !== "SUCCESS") return layer("NOT_APPLICABLE");

  const exitDecisions = bundle.decisions.filter((decision) => (
    decision.decisionType === "EXIT"
    && decisionLifecycleBefore(decision) === "POSITION_OPEN"
  ));
  const supervisorPositions = bundle.positionStates.filter((position) => supervisorLifecycle(position) !== null);
  const closed = supervisorPositions.some((position) => supervisorLifecycle(position) === "CLOSED");
  const refs = [
    ...refsForDecisions(exitDecisions),
    ...refsForOrders(bundle.orderReferences),
    ...refsForPositions(supervisorPositions),
    evidenceRef("episode-outcome", bundle.outcome.episodeOutcomeId)
  ];

  if (exitDecisions.length === 0) return layer("INCONCLUSIVE", refs);
  return layer(closed ? "SUCCESS" : "FAILURE", refs);
}

export function deriveEpisodeAttributionFromBundle(input) {
  const bundle = normalizeCompletedBundle(input);
  const scanner = scannerAttribution(bundle);
  const entry = entryAttribution(bundle, scanner);
  const fill = fillAttribution(bundle);
  const positionManagement = positionManagementAttribution(bundle, fill);
  const exit = exitAttribution(bundle, fill);

  return createEpisodeAttribution({
    tradeEpisodeId: bundle.episode.tradeEpisodeId,
    policyVersionId: bundle.episode.policyVersionId,
    completedAtMs: bundle.episode.completedAtMs,
    layers: {
      scanner,
      entry,
      fill,
      positionManagement,
      exit
    }
  });
}

export async function deriveEpisodeAttributionFromLedger({ ledger, tradingRunId, tradeEpisodeId } = {}) {
  if (!ledger || typeof ledger.getTradeEpisodeBundle !== "function") {
    throw new TypeError("ledger.getTradeEpisodeBundle() is required");
  }
  const bundle = await ledger.getTradeEpisodeBundle(tradingRunId, tradeEpisodeId);
  if (!bundle) throw new Error("Trade Episode was not found");
  return deriveEpisodeAttributionFromBundle(bundle);
}
