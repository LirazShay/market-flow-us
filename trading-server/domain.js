import { DECISION_PROPOSAL_TYPES } from "./supervisor.js";

export const TRADING_DOMAIN_SCHEMA_VERSION = 1;
export const TRADING_PROPOSAL_INBOX_VERSION = 1;

const DEFAULT_MAX_PENDING_EPISODES = 100;
const MAX_PENDING_EPISODES = 1_000;
const MAX_RESUME_EPISODES = 50;
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
  proposalInbox = createTradingProposalInbox()
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

  const ledgerSchemaVersion = Number.isSafeInteger(ledger.schemaVersion)
    ? ledger.schemaVersion
    : null;

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
