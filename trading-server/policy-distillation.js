export const POLICY_ATTRIBUTION_SCHEMA_VERSION = 1;

export const POLICY_ATTRIBUTION_LAYERS = Object.freeze([
  "scanner",
  "entry",
  "fill",
  "positionManagement",
  "exit"
]);

export const POLICY_ATTRIBUTION_OUTCOMES = Object.freeze([
  "SUCCESS",
  "FAILURE",
  "INCONCLUSIVE",
  "NOT_APPLICABLE"
]);

const ATTRIBUTION_OUTCOME_SET = new Set(POLICY_ATTRIBUTION_OUTCOMES);
const MAX_IDENTIFIER_CHARS = 256;
const MAX_EVIDENCE_REF_CHARS = 512;
const MAX_EVIDENCE_REFS_PER_LAYER = 64;
const LAYER_FIELDS = new Set(["outcome", "evidenceRefs"]);
const EPISODE_REQUIRED_FIELDS = Object.freeze([
  "tradeEpisodeId",
  "policyVersionId",
  "completedAtMs",
  "layers"
]);
const EPISODE_FIELDS = new Set(["schemaVersion", ...EPISODE_REQUIRED_FIELDS]);

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

function normalizeEvidenceRefs(value, label) {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_REFS_PER_LAYER) {
    throw new TypeError(`${label} must be an array with at most ${MAX_EVIDENCE_REFS_PER_LAYER} entries`);
  }
  const refs = value.map((item, index) => {
    if (
      typeof item !== "string"
      || item.trim() !== item
      || item.length === 0
      || item.length > MAX_EVIDENCE_REF_CHARS
      || /[\u0000-\u001f\u007f]/u.test(item)
    ) {
      throw new TypeError(`${label}[${index}] must be a bounded public-safe evidence reference`);
    }
    return item;
  });
  return Object.freeze([...new Set(refs)].sort());
}

function normalizeLayer(value, layer) {
  assertExactFields(value, LAYER_FIELDS, `layers.${layer}`);
  if (!Object.hasOwn(value, "outcome") || !Object.hasOwn(value, "evidenceRefs")) {
    throw new TypeError(`layers.${layer} requires outcome and evidenceRefs`);
  }
  if (!ATTRIBUTION_OUTCOME_SET.has(value.outcome)) {
    throw new TypeError(`layers.${layer}.outcome is unsupported`);
  }
  const evidenceRefs = normalizeEvidenceRefs(value.evidenceRefs, `layers.${layer}.evidenceRefs`);
  if (value.outcome !== "NOT_APPLICABLE" && evidenceRefs.length === 0) {
    throw new TypeError(`layers.${layer} requires evidence for ${value.outcome}`);
  }
  return Object.freeze({ outcome: value.outcome, evidenceRefs });
}

function ratio(numerator, denominator) {
  return Object.freeze({
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator
  });
}

function compareNumber(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareString(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function episodeOrder(a, b) {
  return compareNumber(a.completedAtMs, b.completedAtMs)
    || compareString(a.tradeEpisodeId, b.tradeEpisodeId);
}

function freezeLayerSummary(summary) {
  return Object.freeze({
    totalEpisodes: summary.totalEpisodes,
    applicableEpisodes: summary.applicableEpisodes,
    conclusiveEpisodes: summary.conclusiveEpisodes,
    successEpisodes: summary.successEpisodes,
    failureEpisodes: summary.failureEpisodes,
    inconclusiveEpisodes: summary.inconclusiveEpisodes,
    notApplicableEpisodes: summary.notApplicableEpisodes,
    successRate: ratio(summary.successEpisodes, summary.conclusiveEpisodes),
    evidenceCoverage: ratio(summary.evidencedApplicableEpisodes, summary.applicableEpisodes),
    evidenceRefs: Object.freeze([...summary.evidenceRefs].sort())
  });
}

function normalizeSummary(value, label) {
  if (!isPlainObject(value) || value.schemaVersion !== POLICY_ATTRIBUTION_SCHEMA_VERSION) {
    throw new TypeError(`${label} must be a policy attribution summary`);
  }
  assertIdentifier(value.policyVersionId, `${label}.policyVersionId`);
  if (!isPlainObject(value.layers)) throw new TypeError(`${label}.layers must be an object`);
  for (const layer of POLICY_ATTRIBUTION_LAYERS) {
    const layerSummary = value.layers[layer];
    if (!isPlainObject(layerSummary) || !isPlainObject(layerSummary.successRate)) {
      throw new TypeError(`${label}.layers.${layer} must be an attribution layer summary`);
    }
  }
  return value;
}

export function createEpisodeAttribution(input) {
  assertExactFields(input, EPISODE_FIELDS, "episodeAttribution");
  for (const field of EPISODE_REQUIRED_FIELDS) {
    if (!Object.hasOwn(input, field)) throw new TypeError(`episodeAttribution.${field} is required`);
  }
  if (Object.hasOwn(input, "schemaVersion") && input.schemaVersion !== POLICY_ATTRIBUTION_SCHEMA_VERSION) {
    throw new TypeError("episodeAttribution.schemaVersion is unsupported");
  }
  if (!isPlainObject(input.layers)) throw new TypeError("episodeAttribution.layers must be an object");
  const layerKeys = Object.keys(input.layers);
  if (
    layerKeys.length !== POLICY_ATTRIBUTION_LAYERS.length
    || POLICY_ATTRIBUTION_LAYERS.some((layer) => !Object.hasOwn(input.layers, layer))
    || layerKeys.some((layer) => !POLICY_ATTRIBUTION_LAYERS.includes(layer))
  ) {
    throw new TypeError("episodeAttribution.layers must contain exactly the five attribution layers");
  }

  const layers = {};
  for (const layer of POLICY_ATTRIBUTION_LAYERS) {
    layers[layer] = normalizeLayer(input.layers[layer], layer);
  }

  return Object.freeze({
    schemaVersion: POLICY_ATTRIBUTION_SCHEMA_VERSION,
    tradeEpisodeId: assertIdentifier(input.tradeEpisodeId, "tradeEpisodeId"),
    policyVersionId: assertIdentifier(input.policyVersionId, "policyVersionId"),
    completedAtMs: assertTimestamp(input.completedAtMs, "completedAtMs"),
    layers: Object.freeze(layers)
  });
}

export function summarizePolicyAttribution({ policyVersionId, episodes } = {}) {
  const expectedPolicyVersionId = assertIdentifier(policyVersionId, "policyVersionId");
  if (!Array.isArray(episodes)) throw new TypeError("episodes must be an array");

  const normalizedEpisodes = episodes.map((episode) => createEpisodeAttribution(episode));
  const seenEpisodeIds = new Set();
  for (const episode of normalizedEpisodes) {
    if (episode.policyVersionId !== expectedPolicyVersionId) {
      throw new TypeError("episode PolicyVersion does not match the requested summary PolicyVersion");
    }
    if (seenEpisodeIds.has(episode.tradeEpisodeId)) {
      throw new TypeError(`duplicate TradeEpisode attribution: ${episode.tradeEpisodeId}`);
    }
    seenEpisodeIds.add(episode.tradeEpisodeId);
  }
  normalizedEpisodes.sort(episodeOrder);

  const layers = {};
  for (const layer of POLICY_ATTRIBUTION_LAYERS) {
    const layerSummary = {
      totalEpisodes: normalizedEpisodes.length,
      applicableEpisodes: 0,
      conclusiveEpisodes: 0,
      successEpisodes: 0,
      failureEpisodes: 0,
      inconclusiveEpisodes: 0,
      notApplicableEpisodes: 0,
      evidencedApplicableEpisodes: 0,
      evidenceRefs: new Set()
    };

    for (const episode of normalizedEpisodes) {
      const attribution = episode.layers[layer];
      for (const reference of attribution.evidenceRefs) layerSummary.evidenceRefs.add(reference);
      switch (attribution.outcome) {
        case "SUCCESS":
          layerSummary.applicableEpisodes += 1;
          layerSummary.conclusiveEpisodes += 1;
          layerSummary.successEpisodes += 1;
          layerSummary.evidencedApplicableEpisodes += 1;
          break;
        case "FAILURE":
          layerSummary.applicableEpisodes += 1;
          layerSummary.conclusiveEpisodes += 1;
          layerSummary.failureEpisodes += 1;
          layerSummary.evidencedApplicableEpisodes += 1;
          break;
        case "INCONCLUSIVE":
          layerSummary.applicableEpisodes += 1;
          layerSummary.inconclusiveEpisodes += 1;
          layerSummary.evidencedApplicableEpisodes += 1;
          break;
        case "NOT_APPLICABLE":
          layerSummary.notApplicableEpisodes += 1;
          break;
        default:
          throw new Error("unreachable attribution outcome");
      }
    }

    layers[layer] = freezeLayerSummary(layerSummary);
  }

  return Object.freeze({
    schemaVersion: POLICY_ATTRIBUTION_SCHEMA_VERSION,
    policyVersionId: expectedPolicyVersionId,
    episodeCount: normalizedEpisodes.length,
    episodeIds: Object.freeze(normalizedEpisodes.map((episode) => episode.tradeEpisodeId)),
    layers: Object.freeze(layers)
  });
}

export function comparePolicyAttribution({
  baseline,
  candidate,
  minimumConclusiveEpisodes = 1
} = {}) {
  const baselineSummary = normalizeSummary(baseline, "baseline");
  const candidateSummary = normalizeSummary(candidate, "candidate");
  if (baselineSummary.policyVersionId === candidateSummary.policyVersionId) {
    throw new TypeError("baseline and candidate PolicyVersions must be different");
  }
  if (!Number.isSafeInteger(minimumConclusiveEpisodes) || minimumConclusiveEpisodes < 1 || minimumConclusiveEpisodes > 10_000) {
    throw new TypeError("minimumConclusiveEpisodes must be an integer between 1 and 10000");
  }

  const layers = {};
  let comparableLayerCount = 0;
  for (const layer of POLICY_ATTRIBUTION_LAYERS) {
    const baselineLayer = baselineSummary.layers[layer];
    const candidateLayer = candidateSummary.layers[layer];
    const enoughConclusive = (
      baselineLayer.successRate.denominator >= minimumConclusiveEpisodes
      && candidateLayer.successRate.denominator >= minimumConclusiveEpisodes
    );
    const completeEvidence = (
      baselineLayer.evidenceCoverage.numerator === baselineLayer.evidenceCoverage.denominator
      && candidateLayer.evidenceCoverage.numerator === candidateLayer.evidenceCoverage.denominator
    );
    const comparable = enoughConclusive && completeEvidence;
    if (comparable) comparableLayerCount += 1;

    layers[layer] = Object.freeze({
      status: comparable ? "COMPARABLE" : "INSUFFICIENT_EVIDENCE",
      baselineSuccessRate: baselineLayer.successRate,
      candidateSuccessRate: candidateLayer.successRate,
      deltaSuccessRate: comparable
        ? candidateLayer.successRate.value - baselineLayer.successRate.value
        : null,
      minimumConclusiveEpisodes,
      evidenceComplete: completeEvidence
    });
  }

  return Object.freeze({
    schemaVersion: POLICY_ATTRIBUTION_SCHEMA_VERSION,
    baselinePolicyVersionId: baselineSummary.policyVersionId,
    candidatePolicyVersionId: candidateSummary.policyVersionId,
    minimumConclusiveEpisodes,
    comparableLayerCount,
    comparisonStatus: comparableLayerCount === 0 ? "INSUFFICIENT_EVIDENCE" : "LAYER_EVIDENCE_AVAILABLE",
    layers: Object.freeze(layers)
  });
}

export function comparePolicyVersions({
  baselinePolicyVersionId,
  candidatePolicyVersionId,
  episodes,
  minimumConclusiveEpisodes = 1
} = {}) {
  const baselineId = assertIdentifier(baselinePolicyVersionId, "baselinePolicyVersionId");
  const candidateId = assertIdentifier(candidatePolicyVersionId, "candidatePolicyVersionId");
  if (baselineId === candidateId) throw new TypeError("PolicyVersions must be different");
  if (!Array.isArray(episodes)) throw new TypeError("episodes must be an array");

  const baselineEpisodes = [];
  const candidateEpisodes = [];
  for (const episode of episodes) {
    const normalized = createEpisodeAttribution(episode);
    if (normalized.policyVersionId === baselineId) baselineEpisodes.push(normalized);
    else if (normalized.policyVersionId === candidateId) candidateEpisodes.push(normalized);
    else throw new TypeError(`episode ${normalized.tradeEpisodeId} belongs to an unexpected PolicyVersion`);
  }

  const baseline = summarizePolicyAttribution({ policyVersionId: baselineId, episodes: baselineEpisodes });
  const candidate = summarizePolicyAttribution({ policyVersionId: candidateId, episodes: candidateEpisodes });
  const comparison = comparePolicyAttribution({ baseline, candidate, minimumConclusiveEpisodes });

  return Object.freeze({ baseline, candidate, comparison });
}
