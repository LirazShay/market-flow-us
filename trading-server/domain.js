import { createHash } from "node:crypto";

import {
  assessPolicyCandidatePromotion,
  createPolicyCandidate
} from "./policy-promotion.js";
import { comparePolicyVersions as comparePolicyAttributionVersions } from "./policy-distillation.js";
import { deriveEpisodeAttributionFromLedger } from "./policy-episode-attribution.js";
import { DECISION_PROPOSAL_TYPES } from "./supervisor.js";

export const TRADING_DOMAIN_SCHEMA_VERSION = 1;
export const TRADING_PROPOSAL_INBOX_VERSION = 1;

const DEFAULT_MAX_PENDING_EPISODES = 100;
const MAX_PENDING_EPISODES = 1_000;
const MAX_RESUME_EPISODES = 50;
const MAX_POLICY_COMPARISON_EPISODES_PER_RUN = 25;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_CANDIDATE_KEY_LENGTH = 512;
const PROPOSAL_FIELDS = new Set([
  "decisionType",
  "tradingRunId",
  "tradeEpisodeId",
  "policyVersionId",
  "observedStateVersion",
  "targetCandidateKey"
]);
const PROPOSAL_REQUIRED_FIELDS = Object.freeze([
  "decisionType",
  "tradingRunId",
  "tradeEpisodeId",
  "policyVersionId",
  "observedStateVersion"
]);
const POLICY_SELECTION_FIELDS = new Set(["tradingRunId", "tradeEpisodeIds"]);
const POLICY_COMPARISON_FIELDS = new Set([
  "baseline",
  "candidate",
  "minimumConclusiveEpisodes"
]);
const POLICY_CANDIDATE_BUILD_FIELDS = new Set([
  ...POLICY_COMPARISON_FIELDS,
  "policyCandidateId",
  "claimScope",
  "policy",
  "strategyValidationTarget"
]);

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactFields(value, allowed, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label}.${key} is not supported`);
  }
}

function assertDependency(value, method, label) {
  if (!value || typeof value[method] !== "function") {
    throw new TypeError(`${label}.${method} must be a function`);
  }
}

function assertIdentifier(value, label) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > MAX_IDENTIFIER_LENGTH
  ) {
    throw codedError("TRADING_PROPOSAL_MALFORMED", `${label} is invalid`);
  }
  return value;
}

function assertLearningIdentifier(value, label) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length === 0
    || value.length > MAX_IDENTIFIER_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function assertCandidateKey(value) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > MAX_CANDIDATE_KEY_LENGTH
  ) {
    throw codedError("TRADING_PROPOSAL_MALFORMED", "targetCandidateKey is invalid");
  }
  return value;
}

function readNow(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("now() must return a non-negative safe integer millisecond timestamp");
  }
  return value;
}

function normalizeDecisionProposal(value) {
  if (!isPlainObject(value)) {
    throw codedError("TRADING_PROPOSAL_MALFORMED", "DecisionProposal must be an object");
  }
  const keys = Object.keys(value);
  if (
    keys.some((key) => !PROPOSAL_FIELDS.has(key))
    || PROPOSAL_REQUIRED_FIELDS.some((key) => !Object.hasOwn(value, key))
  ) {
    throw codedError("TRADING_PROPOSAL_MALFORMED", "DecisionProposal fields are invalid");
  }
  if (!DECISION_PROPOSAL_TYPES.includes(value.decisionType)) {
    throw codedError("TRADING_PROPOSAL_MALFORMED", "DecisionProposal decisionType is invalid");
  }
  const tradingRunId = assertIdentifier(value.tradingRunId, "tradingRunId");
  const tradeEpisodeId = assertIdentifier(value.tradeEpisodeId, "tradeEpisodeId");
  const policyVersionId = assertIdentifier(value.policyVersionId, "policyVersionId");
  if (!Number.isSafeInteger(value.observedStateVersion) || value.observedStateVersion < 0) {
    throw codedError("TRADING_PROPOSAL_MALFORMED", "observedStateVersion is invalid");
  }
  if (value.decisionType === "SWITCH") {
    if (!Object.hasOwn(value, "targetCandidateKey")) {
      throw codedError("TRADING_PROPOSAL_MALFORMED", "SWITCH requires targetCandidateKey");
    }
  } else if (Object.hasOwn(value, "targetCandidateKey")) {
    throw codedError("TRADING_PROPOSAL_MALFORMED", "targetCandidateKey is only valid for SWITCH");
  }

  return Object.freeze({
    decisionType: value.decisionType,
    tradingRunId,
    tradeEpisodeId,
    policyVersionId,
    observedStateVersion: value.observedStateVersion,
    ...(value.decisionType === "SWITCH"
      ? { targetCandidateKey: assertCandidateKey(value.targetCandidateKey) }
      : {})
  });
}

function normalizePolicySelection(value, label) {
  assertExactFields(value, POLICY_SELECTION_FIELDS, label);
  for (const field of POLICY_SELECTION_FIELDS) {
    if (!Object.hasOwn(value, field)) throw new TypeError(`${label}.${field} is required`);
  }
  const tradingRunId = assertLearningIdentifier(value.tradingRunId, `${label}.tradingRunId`);
  if (
    !Array.isArray(value.tradeEpisodeIds)
    || value.tradeEpisodeIds.length < 1
    || value.tradeEpisodeIds.length > MAX_POLICY_COMPARISON_EPISODES_PER_RUN
  ) {
    throw new TypeError(
      `${label}.tradeEpisodeIds must contain between 1 and ${MAX_POLICY_COMPARISON_EPISODES_PER_RUN} IDs`
    );
  }
  const tradeEpisodeIds = value.tradeEpisodeIds.map((item, index) => (
    assertLearningIdentifier(item, `${label}.tradeEpisodeIds[${index}]`)
  ));
  if (new Set(tradeEpisodeIds).size !== tradeEpisodeIds.length) {
    throw new TypeError(`${label}.tradeEpisodeIds must be unique`);
  }
  return Object.freeze({
    tradingRunId,
    tradeEpisodeIds: Object.freeze([...tradeEpisodeIds].sort())
  });
}

function normalizeMinimumConclusiveEpisodes(value) {
  const normalized = value ?? 1;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 10_000) {
    throw new TypeError("minimumConclusiveEpisodes must be an integer between 1 and 10000");
  }
  return normalized;
}

function normalizePolicyComparisonRequest(value) {
  assertExactFields(value, POLICY_COMPARISON_FIELDS, "policyComparison");
  if (!Object.hasOwn(value, "baseline") || !Object.hasOwn(value, "candidate")) {
    throw new TypeError("policyComparison baseline and candidate are required");
  }
  return Object.freeze({
    baseline: normalizePolicySelection(value.baseline, "policyComparison.baseline"),
    candidate: normalizePolicySelection(value.candidate, "policyComparison.candidate"),
    minimumConclusiveEpisodes: normalizeMinimumConclusiveEpisodes(value.minimumConclusiveEpisodes)
  });
}

function compactLayerSummary(value) {
  return Object.freeze({
    totalEpisodes: value.totalEpisodes,
    applicableEpisodes: value.applicableEpisodes,
    conclusiveEpisodes: value.conclusiveEpisodes,
    successEpisodes: value.successEpisodes,
    failureEpisodes: value.failureEpisodes,
    inconclusiveEpisodes: value.inconclusiveEpisodes,
    notApplicableEpisodes: value.notApplicableEpisodes,
    successRate: value.successRate,
    evidenceCoverage: value.evidenceCoverage,
    evidenceRefCount: value.evidenceRefs.length
  });
}

function compactAttributionSummary(value) {
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    policyVersionId: value.policyVersionId,
    episodeCount: value.episodeCount,
    episodeIds: value.episodeIds,
    layers: Object.freeze(Object.fromEntries(
      Object.entries(value.layers).map(([name, layer]) => [name, compactLayerSummary(layer)])
    ))
  });
}

function comparisonEvidenceRef(value) {
  const digest = createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
  return `policy-attribution-comparison:sha256:${digest}`;
}

function scopeKey(tradingRunId, tradeEpisodeId) {
  return JSON.stringify([tradingRunId, tradeEpisodeId]);
}

export function createTradingProposalInbox({
  maxPendingEpisodes = DEFAULT_MAX_PENDING_EPISODES
} = {}) {
  if (
    !Number.isSafeInteger(maxPendingEpisodes)
    || maxPendingEpisodes < 1
    || maxPendingEpisodes > MAX_PENDING_EPISODES
  ) {
    throw new TypeError(`maxPendingEpisodes must be an integer between 1 and ${MAX_PENDING_EPISODES}`);
  }

  const pending = new Map();

  return Object.freeze({
    version: TRADING_PROPOSAL_INBOX_VERSION,

    submit(proposal) {
      const normalized = normalizeDecisionProposal(proposal);
      const key = scopeKey(normalized.tradingRunId, normalized.tradeEpisodeId);
      const replacedPendingProposal = pending.has(key);
      if (!replacedPendingProposal && pending.size >= maxPendingEpisodes) {
        throw codedError("TRADING_PROPOSAL_INBOX_FULL", "Trading proposal inbox is full");
      }
      pending.set(key, normalized);
      return Object.freeze({ replacedPendingProposal, proposal: normalized });
    },

    take({ tradingRunId, tradeEpisodeId } = {}) {
      if (typeof tradingRunId !== "string" || typeof tradeEpisodeId !== "string") return null;
      const key = scopeKey(tradingRunId, tradeEpisodeId);
      const proposal = pending.get(key) ?? null;
      if (proposal !== null) pending.delete(key);
      return proposal;
    },

    get pendingCount() {
      return pending.size;
    }
  });
}

function supervisorSummary(bundle) {
  if (!bundle || !Array.isArray(bundle.positionStates)) return null;
  for (let index = bundle.positionStates.length - 1; index >= 0; index -= 1) {
    const state = bundle.positionStates[index]?.state;
    if (state?.kind !== "TRADING_SUPERVISOR_V1" || state?.version !== 1) continue;
    const supervisorState = state.supervisorState;
    if (!supervisorState || typeof supervisorState !== "object") return null;
    return Object.freeze({
      runtimeState: state.runtimeState ?? null,
      lifecycleState: supervisorState.lifecycleState ?? null,
      stateVersion: supervisorState.stateVersion ?? null
    });
  }
  return null;
}

function episodeSummary(episode, bundle) {
  return Object.freeze({
    tradeEpisodeId: episode.tradeEpisodeId,
    policyVersionId: episode.policyVersionId,
    lifecycleState: episode.lifecycleState,
    candidateKey: episode.candidateKey,
    updatedAtMs: episode.updatedAtMs,
    supervisor: supervisorSummary(bundle)
  });
}

export function createTradingDomain({
  ledger,
  proposalInbox = createTradingProposalInbox(),
  now = Date.now
} = {}) {
  for (const method of [
    "getTradingRun",
    "listTradingRuns",
    "listTradeEpisodes",
    "getTradeEpisodeBundle"
  ]) {
    assertDependency(ledger, method, "ledger");
  }
  assertDependency(proposalInbox, "submit", "proposalInbox");
  assertDependency(proposalInbox, "take", "proposalInbox");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const ledgerSchemaVersion = Number.isSafeInteger(ledger.schemaVersion)
    ? ledger.schemaVersion
    : null;

  async function deriveSelection(selection) {
    const tradingRun = await ledger.getTradingRun(selection.tradingRunId);
    if (!tradingRun) throw new Error(`Trading Run was not found: ${selection.tradingRunId}`);
    const episodes = [];
    for (const tradeEpisodeId of selection.tradeEpisodeIds) {
      const attribution = await deriveEpisodeAttributionFromLedger({
        ledger,
        tradingRunId: selection.tradingRunId,
        tradeEpisodeId
      });
      if (attribution.policyVersionId !== tradingRun.policyVersionId) {
        throw new Error("Trade Episode PolicyVersion does not match its Trading Run");
      }
      episodes.push(attribution);
    }
    return Object.freeze({ tradingRun, episodes: Object.freeze(episodes) });
  }

  async function compareDurablePolicyVersions(input) {
    const request = normalizePolicyComparisonRequest(input);
    const [baselineSelection, candidateSelection] = await Promise.all([
      deriveSelection(request.baseline),
      deriveSelection(request.candidate)
    ]);
    if (baselineSelection.tradingRun.policyVersionId === candidateSelection.tradingRun.policyVersionId) {
      throw new TypeError("Policy comparison requires two different PolicyVersions");
    }

    const full = comparePolicyAttributionVersions({
      baselinePolicyVersionId: baselineSelection.tradingRun.policyVersionId,
      candidatePolicyVersionId: candidateSelection.tradingRun.policyVersionId,
      episodes: [...baselineSelection.episodes, ...candidateSelection.episodes],
      minimumConclusiveEpisodes: request.minimumConclusiveEpisodes
    });
    const evidenceRef = comparisonEvidenceRef({
      baseline: {
        tradingRunId: request.baseline.tradingRunId,
        policyVersionId: baselineSelection.tradingRun.policyVersionId,
        tradeEpisodeIds: request.baseline.tradeEpisodeIds
      },
      candidate: {
        tradingRunId: request.candidate.tradingRunId,
        policyVersionId: candidateSelection.tradingRun.policyVersionId,
        tradeEpisodeIds: request.candidate.tradeEpisodeIds
      },
      minimumConclusiveEpisodes: request.minimumConclusiveEpisodes
    });

    return Object.freeze({
      evidenceRef,
      baseline: Object.freeze({
        tradingRunId: request.baseline.tradingRunId,
        policyVersionId: baselineSelection.tradingRun.policyVersionId,
        episodeIds: request.baseline.tradeEpisodeIds,
        summary: compactAttributionSummary(full.baseline)
      }),
      candidate: Object.freeze({
        tradingRunId: request.candidate.tradingRunId,
        policyVersionId: candidateSelection.tradingRun.policyVersionId,
        episodeIds: request.candidate.tradeEpisodeIds,
        summary: compactAttributionSummary(full.candidate)
      }),
      comparison: full.comparison
    });
  }

  return Object.freeze({
    schemaVersions: Object.freeze({
      tradingDomain: TRADING_DOMAIN_SCHEMA_VERSION,
      tradingLedger: ledgerSchemaVersion
    }),

    async getTradingRun(tradingRunId) {
      return ledger.getTradingRun(tradingRunId);
    },

    async listTradingRuns(options) {
      return ledger.listTradingRuns(options);
    },

    async resumeTradingRun(tradingRunId) {
      const tradingRun = await ledger.getTradingRun(tradingRunId);
      if (!tradingRun) return null;
      const allEpisodes = await ledger.listTradeEpisodes(tradingRunId);
      const selected = allEpisodes.slice(-MAX_RESUME_EPISODES);
      const summaries = await Promise.all(selected.map(async (episode) => episodeSummary(
        episode,
        await ledger.getTradeEpisodeBundle(tradingRunId, episode.tradeEpisodeId)
      )));
      return Object.freeze({
        tradingRun,
        episodeCount: allEpisodes.length,
        truncated: allEpisodes.length > selected.length,
        episodes: Object.freeze(summaries)
      });
    },

    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      return ledger.getTradeEpisodeBundle(tradingRunId, tradeEpisodeId);
    },

    async getTradeEpisodeAttribution(tradingRunId, tradeEpisodeId) {
      return deriveEpisodeAttributionFromLedger({ ledger, tradingRunId, tradeEpisodeId });
    },

    async comparePolicyVersions(input) {
      return compareDurablePolicyVersions(input);
    },

    async buildPolicyCandidate(input) {
      assertExactFields(input, POLICY_CANDIDATE_BUILD_FIELDS, "policyCandidateBuild");
      for (const field of ["baseline", "candidate", "policyCandidateId", "claimScope", "policy"]) {
        if (!Object.hasOwn(input, field)) throw new TypeError(`policyCandidateBuild.${field} is required`);
      }
      const comparison = await compareDurablePolicyVersions({
        baseline: input.baseline,
        candidate: input.candidate,
        minimumConclusiveEpisodes: input.minimumConclusiveEpisodes
      });
      const candidate = createPolicyCandidate({
        policyCandidateId: assertLearningIdentifier(input.policyCandidateId, "policyCandidateId"),
        baselinePolicyVersionId: comparison.baseline.policyVersionId,
        createdAtMs: readNow(now),
        claimScope: input.claimScope,
        policy: input.policy,
        learningEvidenceRefs: [comparison.evidenceRef],
        ...(Object.hasOwn(input, "strategyValidationTarget")
          ? { strategyValidationTarget: input.strategyValidationTarget }
          : {})
      });
      const assessment = assessPolicyCandidatePromotion({ candidate, validationEvidence: [] });
      return Object.freeze({
        candidate,
        learningComparison: comparison,
        assessment
      });
    },

    async submitDecisionProposal(input) {
      const proposal = normalizeDecisionProposal(input);
      const tradingRun = await ledger.getTradingRun(proposal.tradingRunId);
      if (!tradingRun) {
        throw codedError("TRADING_PROPOSAL_RUN_NOT_FOUND", "Trading Run was not found");
      }
      const bundle = await ledger.getTradeEpisodeBundle(
        proposal.tradingRunId,
        proposal.tradeEpisodeId
      );
      if (!bundle) {
        throw codedError("TRADING_PROPOSAL_EPISODE_NOT_FOUND", "Trade Episode was not found");
      }
      if (
        tradingRun.policyVersionId !== proposal.policyVersionId
        || bundle.episode?.policyVersionId !== proposal.policyVersionId
      ) {
        throw codedError("TRADING_PROPOSAL_POLICY_MISMATCH", "DecisionProposal PolicyVersion does not match durable authority");
      }

      const queued = proposalInbox.submit(proposal);
      return Object.freeze({
        submissionStatus: "QUEUED_FOR_SUPERVISOR_VALIDATION",
        replacedPendingProposal: queued.replacedPendingProposal,
        tradingRunId: proposal.tradingRunId,
        tradeEpisodeId: proposal.tradeEpisodeId,
        policyVersionId: proposal.policyVersionId,
        observedStateVersion: proposal.observedStateVersion
      });
    },

    async readDecisionProposal(request = {}) {
      return proposalInbox.take({
        tradingRunId: request.tradingRunId,
        tradeEpisodeId: request.tradeEpisodeId
      });
    }
  });
}
