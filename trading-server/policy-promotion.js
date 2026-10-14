export const POLICY_CANDIDATE_SCHEMA_VERSION = 1;
export const DETERMINISTIC_POLICY_SCHEMA_VERSION = 1;

export const POLICY_CANDIDATE_CLAIM_SCOPES = Object.freeze([
  "EXECUTION_ONLY",
  "STRATEGY_LEVEL"
]);

export const POLICY_VALIDATION_AUTHORITIES = Object.freeze([
  "EPISODE_ATTRIBUTION",
  "HISTORICAL_BACKTEST"
]);

export const POLICY_VALIDATION_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "INSUFFICIENT_EVIDENCE"
]);

const CLAIM_SCOPE_SET = new Set(POLICY_CANDIDATE_CLAIM_SCOPES);
const VALIDATION_AUTHORITY_SET = new Set(POLICY_VALIDATION_AUTHORITIES);
const VALIDATION_STATUS_SET = new Set(POLICY_VALIDATION_STATUSES);
const MAX_IDENTIFIER_CHARS = 256;
const MAX_EVIDENCE_REF_CHARS = 512;
const MAX_EVIDENCE_REFS = 64;
const MAX_POLICY_INTERVAL_MS = 86_400_000;
const MAX_POLICY_THRESHOLD_BPS = 100_000;
const POLICY_KIND = "DETERMINISTIC_TRADING_POLICY_V1";

const POLICY_FIELDS = new Set(["schemaVersion", "kind", "entry", "exit"]);
const ENTRY_FIELDS = new Set(["enterOnUsableQuote", "maxWatchMs"]);
const EXIT_FIELDS = new Set(["takeProfitBps", "stopLossBps", "maxHoldMs"]);
const CANDIDATE_FIELDS = new Set([
  "schemaVersion",
  "policyCandidateId",
  "baselinePolicyVersionId",
  "createdAtMs",
  "claimScope",
  "policy",
  "learningEvidenceRefs"
]);
const VALIDATION_FIELDS = new Set(["authority", "status", "evidenceRef"]);

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

function assertIdentifier(value, label) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length === 0
    || value.length > MAX_IDENTIFIER_CHARS
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError(`${label} must be a non-empty bounded identifier`);
  }
  return value;
}

function assertTimestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function assertPositiveBoundedInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function assertFinitePositiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number`);
  }
  return value;
}

function normalizeEvidenceRef(value, label) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length === 0
    || value.length > MAX_EVIDENCE_REF_CHARS
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError(`${label} must be a bounded public-safe evidence reference`);
  }
  return value;
}

function normalizeEvidenceRefs(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_REFS) {
    throw new TypeError(`${label} must contain between 1 and ${MAX_EVIDENCE_REFS} evidence references`);
  }
  const refs = value.map((item, index) => normalizeEvidenceRef(item, `${label}[${index}]`));
  return Object.freeze([...new Set(refs)].sort());
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function normalizeDeterministicPolicy(input) {
  assertExactFields(input, POLICY_FIELDS, "policy");
  if (Object.hasOwn(input, "schemaVersion") && input.schemaVersion !== DETERMINISTIC_POLICY_SCHEMA_VERSION) {
    throw new TypeError("policy.schemaVersion is unsupported");
  }
  if (input.kind !== POLICY_KIND) throw new TypeError(`policy.kind must be ${POLICY_KIND}`);

  assertExactFields(input.entry, ENTRY_FIELDS, "policy.entry");
  if (typeof input.entry.enterOnUsableQuote !== "boolean") {
    throw new TypeError("policy.entry.enterOnUsableQuote must be boolean");
  }
  const entry = {
    enterOnUsableQuote: input.entry.enterOnUsableQuote,
    maxWatchMs: assertPositiveBoundedInteger(
      input.entry.maxWatchMs,
      "policy.entry.maxWatchMs",
      MAX_POLICY_INTERVAL_MS
    )
  };

  assertExactFields(input.exit, EXIT_FIELDS, "policy.exit");
  const exit = {
    takeProfitBps: assertPositiveBoundedInteger(
      input.exit.takeProfitBps,
      "policy.exit.takeProfitBps",
      MAX_POLICY_THRESHOLD_BPS
    ),
    stopLossBps: assertPositiveBoundedInteger(
      input.exit.stopLossBps,
      "policy.exit.stopLossBps",
      MAX_POLICY_THRESHOLD_BPS
    ),
    maxHoldMs: assertPositiveBoundedInteger(
      input.exit.maxHoldMs,
      "policy.exit.maxHoldMs",
      MAX_POLICY_INTERVAL_MS
    )
  };

  return deepFreeze({
    schemaVersion: DETERMINISTIC_POLICY_SCHEMA_VERSION,
    kind: POLICY_KIND,
    entry,
    exit
  });
}

export function createPolicyCandidate(input) {
  assertExactFields(input, CANDIDATE_FIELDS, "policyCandidate");
  for (const field of [
    "policyCandidateId",
    "baselinePolicyVersionId",
    "createdAtMs",
    "claimScope",
    "policy",
    "learningEvidenceRefs"
  ]) {
    if (!Object.hasOwn(input, field)) throw new TypeError(`policyCandidate.${field} is required`);
  }
  if (Object.hasOwn(input, "schemaVersion") && input.schemaVersion !== POLICY_CANDIDATE_SCHEMA_VERSION) {
    throw new TypeError("policyCandidate.schemaVersion is unsupported");
  }
  if (!CLAIM_SCOPE_SET.has(input.claimScope)) {
    throw new TypeError("policyCandidate.claimScope is unsupported");
  }

  return deepFreeze({
    schemaVersion: POLICY_CANDIDATE_SCHEMA_VERSION,
    policyCandidateId: assertIdentifier(input.policyCandidateId, "policyCandidateId"),
    baselinePolicyVersionId: assertIdentifier(input.baselinePolicyVersionId, "baselinePolicyVersionId"),
    createdAtMs: assertTimestamp(input.createdAtMs, "createdAtMs"),
    claimScope: input.claimScope,
    policy: normalizeDeterministicPolicy(input.policy),
    learningEvidenceRefs: normalizeEvidenceRefs(input.learningEvidenceRefs, "learningEvidenceRefs")
  });
}

function normalizeValidationEvidence(value, index) {
  assertExactFields(value, VALIDATION_FIELDS, `validationEvidence[${index}]`);
  for (const field of VALIDATION_FIELDS) {
    if (!Object.hasOwn(value, field)) {
      throw new TypeError(`validationEvidence[${index}].${field} is required`);
    }
  }
  if (!VALIDATION_AUTHORITY_SET.has(value.authority)) {
    throw new TypeError(`validationEvidence[${index}].authority is unsupported`);
  }
  if (!VALIDATION_STATUS_SET.has(value.status)) {
    throw new TypeError(`validationEvidence[${index}].status is unsupported`);
  }
  return Object.freeze({
    authority: value.authority,
    status: value.status,
    evidenceRef: normalizeEvidenceRef(value.evidenceRef, `validationEvidence[${index}].evidenceRef`)
  });
}

function requiredAuthorities(candidate) {
  return candidate.claimScope === "STRATEGY_LEVEL"
    ? POLICY_VALIDATION_AUTHORITIES
    : Object.freeze(["EPISODE_ATTRIBUTION"]);
}

export function assessPolicyCandidatePromotion({ candidate, validationEvidence = [] } = {}) {
  const normalizedCandidate = createPolicyCandidate(candidate);
  if (!Array.isArray(validationEvidence)) throw new TypeError("validationEvidence must be an array");
  const normalizedEvidence = validationEvidence.map(normalizeValidationEvidence);
  const byAuthority = new Map();
  for (const evidence of normalizedEvidence) {
    if (byAuthority.has(evidence.authority)) {
      throw new TypeError(`duplicate validation authority: ${evidence.authority}`);
    }
    byAuthority.set(evidence.authority, evidence);
  }

  const reasons = [];
  for (const authority of requiredAuthorities(normalizedCandidate)) {
    const evidence = byAuthority.get(authority);
    if (!evidence) reasons.push(`VALIDATION_MISSING:${authority}`);
    else if (evidence.status !== "PASS") reasons.push(`VALIDATION_NOT_PASS:${authority}:${evidence.status}`);
  }

  return deepFreeze({
    policyCandidateId: normalizedCandidate.policyCandidateId,
    status: reasons.length === 0 ? "READY_FOR_EXPLICIT_PROMOTION" : "NO_PROMOTION",
    reasons: [...reasons].sort(),
    requiredAuthorities: [...requiredAuthorities(normalizedCandidate)],
    validationEvidence: [...normalizedEvidence].sort((a, b) => a.authority.localeCompare(b.authority))
  });
}

export function evaluateDeterministicPolicy({
  policy,
  lifecycleState,
  nowMs,
  watchStartedAtMs = null,
  positionOpenedAtMs = null,
  entryPrice = null,
  quote = null
} = {}) {
  const normalizedPolicy = normalizeDeterministicPolicy(policy);
  const now = assertTimestamp(nowMs, "nowMs");

  if (lifecycleState === "WATCHING") {
    const watchStart = assertTimestamp(watchStartedAtMs, "watchStartedAtMs");
    if (now < watchStart) throw new TypeError("nowMs must not precede watchStartedAtMs");
    if (now - watchStart >= normalizedPolicy.entry.maxWatchMs) {
      return Object.freeze({ decisionType: "SKIP", actionType: "NONE", reasonCode: "POLICY_ENTRY_TIMEOUT" });
    }
    if (normalizedPolicy.entry.enterOnUsableQuote && quote?.usableForNewDecision === true) {
      return Object.freeze({ decisionType: "ENTER", actionType: "REQUEST_ENTRY", reasonCode: "POLICY_USABLE_QUOTE_ENTRY" });
    }
    return Object.freeze({ decisionType: null, actionType: "NONE", reasonCode: "POLICY_WAIT_FOR_ENTRY" });
  }

  if (lifecycleState === "POSITION_OPEN") {
    const openedAt = assertTimestamp(positionOpenedAtMs, "positionOpenedAtMs");
    if (now < openedAt) throw new TypeError("nowMs must not precede positionOpenedAtMs");
    const entry = assertFinitePositiveNumber(entryPrice, "entryPrice");
    const last = quote?.last;
    if (typeof last === "number" && Number.isFinite(last) && last > 0) {
      const moveBps = ((last - entry) / entry) * 10_000;
      if (moveBps <= -normalizedPolicy.exit.stopLossBps) {
        return Object.freeze({ decisionType: "EXIT", actionType: "REQUEST_EXIT", reasonCode: "POLICY_STOP_LOSS" });
      }
      if (moveBps >= normalizedPolicy.exit.takeProfitBps) {
        return Object.freeze({ decisionType: "EXIT", actionType: "REQUEST_EXIT", reasonCode: "POLICY_TAKE_PROFIT" });
      }
    }
    if (now - openedAt >= normalizedPolicy.exit.maxHoldMs) {
      return Object.freeze({ decisionType: "EXIT", actionType: "REQUEST_EXIT", reasonCode: "POLICY_MAX_HOLD" });
    }
    return Object.freeze({ decisionType: "HOLD", actionType: "NONE", reasonCode: "POLICY_HOLD" });
  }

  return Object.freeze({ decisionType: null, actionType: "NONE", reasonCode: "POLICY_STATE_NOT_DECISION_READY" });
}

export async function promotePolicyCandidate({
  ledger,
  candidate,
  validationEvidence = [],
  explicitPromotion = false
} = {}) {
  if (!ledger || typeof ledger.createPolicyVersion !== "function") {
    throw new TypeError("ledger.createPolicyVersion() is required");
  }
  if (typeof explicitPromotion !== "boolean") throw new TypeError("explicitPromotion must be boolean");

  const normalizedCandidate = createPolicyCandidate(candidate);
  const assessment = assessPolicyCandidatePromotion({
    candidate: normalizedCandidate,
    validationEvidence
  });
  if (assessment.status !== "READY_FOR_EXPLICIT_PROMOTION") {
    return deepFreeze({
      status: "NO_PROMOTION",
      policyCandidateId: normalizedCandidate.policyCandidateId,
      reasons: assessment.reasons,
      policyVersion: null
    });
  }
  if (!explicitPromotion) {
    return deepFreeze({
      status: "NO_PROMOTION",
      policyCandidateId: normalizedCandidate.policyCandidateId,
      reasons: ["EXPLICIT_PROMOTION_REQUIRED"],
      policyVersion: null
    });
  }

  const policyVersion = await ledger.createPolicyVersion({ policy: normalizedCandidate.policy });
  if (!isPlainObject(policyVersion) || !isPlainObject(policyVersion.policy)) {
    throw new Error("Trading Ledger returned an invalid PolicyVersion");
  }
  const persistedPolicy = normalizeDeterministicPolicy(policyVersion.policy);
  if (JSON.stringify(persistedPolicy) !== JSON.stringify(normalizedCandidate.policy)) {
    throw new Error("Trading Ledger PolicyVersion does not match promoted PolicyCandidate");
  }

  return deepFreeze({
    status: "PROMOTED",
    policyCandidateId: normalizedCandidate.policyCandidateId,
    reasons: [],
    policyVersion: {
      ...policyVersion,
      policy: persistedPolicy
    }
  });
}
