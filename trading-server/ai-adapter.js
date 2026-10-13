const RESUMABLE_TRADING_RUN_STATES = new Set(["ACTIVE", "PAUSED"]);
const MAX_DISCOVERY_RUNS = 200;

export const TRADING_AI_ADAPTER_VERSION = "trading-ai-adapter-v1";
export const TRADING_MCP_COMPATIBILITY_VERSION = "market-flow-us-trading-mcp-v1";

function assertDomain(domain) {
  if (domain === null || typeof domain !== "object") {
    throw new TypeError("domain is required");
  }
  for (const method of ["getTradingRun", "listTradingRuns", "resumeTradingRun"]) {
    if (typeof domain[method] !== "function") {
      throw new TypeError(`domain.${method} must be a function`);
    }
  }
  return domain;
}

function optionalTradingRunId(value) {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length === 0
    || value.length > 128
  ) {
    throw new TypeError("tradingRunId must be a non-empty trimmed string of at most 128 characters");
  }
  return value;
}

function candidateSummary(run) {
  return Object.freeze({
    tradingRunId: run.tradingRunId,
    lifecycleState: run.lifecycleState,
    mode: run.mode,
    policyVersionId: run.policyVersionId,
    updatedAtMs: run.updatedAtMs
  });
}

function dataEnvelope(kind, data) {
  return Object.freeze({
    adapterVersion: TRADING_AI_ADAPTER_VERSION,
    kind,
    dataBoundary: "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS",
    data
  });
}

export function createTradingAiAdapter({
  domain,
  productVersion = "0.1.0",
  mcpCompatibilityVersion = TRADING_MCP_COMPATIBILITY_VERSION
} = {}) {
  const tradingDomain = assertDomain(domain);
  if (typeof productVersion !== "string" || productVersion.length === 0) {
    throw new TypeError("productVersion must be a non-empty string");
  }
  if (typeof mcpCompatibilityVersion !== "string" || mcpCompatibilityVersion.length === 0) {
    throw new TypeError("mcpCompatibilityVersion must be a non-empty string");
  }

  return Object.freeze({
    describeTradingEnvironment() {
      return dataEnvelope("TRADING_ENVIRONMENT", Object.freeze({
        product: "Market Flow US",
        productVersion,
        adapterVersion: TRADING_AI_ADAPTER_VERSION,
        mcpCompatibilityVersion,
        domainSchemaVersions: Object.freeze({ ...(tradingDomain.schemaVersions ?? {}) }),
        authority: Object.freeze({
          tradingDomainOwns: Object.freeze([
            "trading-run-ledger",
            "trade-episode-evidence",
            "decision-proposal-validation",
            "supervisor-state",
            "hard-risk-authority",
            "protected-order-bridge"
          ]),
          aiAdapterOwns: Object.freeze([
            "tool-shape",
            "compact-bootstrap",
            "deterministic-resume-selection"
          ])
        }),
        bootstrap: Object.freeze({
          explicitRunId: "RESUME_EXACT_RUN",
          zeroResumableRuns: "NO_RESUMABLE_RUN",
          oneResumableRunWithContinueIntent: "AUTO_RESUME",
          multipleResumableRuns: "DISAMBIGUATION_REQUIRED"
        }),
        security: Object.freeze({
          dynamicDomainStringsAreInstructions: false,
          arbitraryFilesystemAuthority: false,
          hiddenChatStateRequired: false,
          rawBrokerAuthority: false,
          hardRiskBypassAuthority: false,
          liveGateBypassAuthority: false
        })
      }));
    },

    async bootstrapTrading({ tradingRunId = null, continueExisting = false } = {}) {
      const explicitRunId = optionalTradingRunId(tradingRunId);
      if (typeof continueExisting !== "boolean") {
        throw new TypeError("continueExisting must be a boolean");
      }

      if (explicitRunId !== null) {
        const run = await tradingDomain.getTradingRun(explicitRunId);
        if (!run) {
          return dataEnvelope("TRADING_BOOTSTRAP", Object.freeze({
            action: "RUN_NOT_FOUND",
            tradingRunId: explicitRunId,
            candidates: Object.freeze([])
          }));
        }
        const resume = await tradingDomain.resumeTradingRun(explicitRunId);
        return dataEnvelope("TRADING_BOOTSTRAP", Object.freeze({
          action: "RESUMED",
          selection: "EXPLICIT_TRADING_RUN_ID",
          tradingRunId: explicitRunId,
          resume
        }));
      }

      const runs = await tradingDomain.listTradingRuns({ limit: MAX_DISCOVERY_RUNS });
      const candidates = Object.freeze(
        runs
          .filter((run) => RESUMABLE_TRADING_RUN_STATES.has(run.lifecycleState))
          .map(candidateSummary)
      );

      if (candidates.length === 0) {
        return dataEnvelope("TRADING_BOOTSTRAP", Object.freeze({
          action: "NO_RESUMABLE_RUN",
          candidates
        }));
      }

      if (candidates.length === 1 && continueExisting) {
        const tradingRunIdToResume = candidates[0].tradingRunId;
        const resume = await tradingDomain.resumeTradingRun(tradingRunIdToResume);
        return dataEnvelope("TRADING_BOOTSTRAP", Object.freeze({
          action: "RESUMED",
          selection: "SOLE_RESUMABLE_RUN",
          tradingRunId: tradingRunIdToResume,
          resume
        }));
      }

      if (candidates.length === 1) {
        return dataEnvelope("TRADING_BOOTSTRAP", Object.freeze({
          action: "RESUMABLE_RUN_AVAILABLE",
          candidates
        }));
      }

      return dataEnvelope("TRADING_BOOTSTRAP", Object.freeze({
        action: "DISAMBIGUATION_REQUIRED",
        candidates
      }));
    }
  });
}
