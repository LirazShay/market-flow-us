import { createContinuousTradingSupervisor } from "./continuous-supervisor.js";
import { createTradingDomain, createTradingProposalInbox } from "./domain.js";
import {
  TRADING_DOMAIN_HOST,
  startTradingDomainTransport
} from "./domain-http.js";

export const TRADING_RUNTIME_HOST_VERSION = "trading-runtime-host-v1";

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requiredEnvironmentValue(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) {
    const error = new Error(`${name} is required`);
    error.code = "TRADING_RUNTIME_HOST_NOT_CONFIGURED";
    throw error;
  }
  return value;
}

export function resolveTradingRuntimeHostTransportOptions(environment = process.env) {
  const rawBaseUrl = requiredEnvironmentValue(
    environment,
    "MARKET_FLOW_US_TRADING_DOMAIN_URL"
  );
  const callerToken = requiredEnvironmentValue(
    environment,
    "MARKET_FLOW_US_TRADING_DOMAIN_TOKEN"
  );
  const url = new URL(rawBaseUrl);
  if (
    url.protocol !== "http:"
    || url.hostname !== TRADING_DOMAIN_HOST
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
    || url.port.length === 0
  ) {
    throw new TypeError(
      `MARKET_FLOW_US_TRADING_DOMAIN_URL must be http://${TRADING_DOMAIN_HOST}:<port>`
    );
  }
  const port = Number(url.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new TypeError("MARKET_FLOW_US_TRADING_DOMAIN_URL must contain a valid explicit port");
  }
  return Object.freeze({
    host: TRADING_DOMAIN_HOST,
    port,
    callerToken
  });
}

export async function startTradingRuntimeHost({
  ledger,
  supervisorRuntime,
  proposalInbox = createTradingProposalInbox(),
  readReconciledOrder = async () => null,
  proposalTimeoutMs,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  transportFactory = startTradingDomainTransport,
  transportOptions = {}
} = {}) {
  assertObject(ledger, "ledger");
  assertObject(supervisorRuntime, "supervisorRuntime");
  assertObject(proposalInbox, "proposalInbox");
  assertObject(transportOptions, "transportOptions");
  if (typeof readReconciledOrder !== "function") {
    throw new TypeError("readReconciledOrder must be a function");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") {
    throw new TypeError("timer functions are required");
  }
  if (typeof transportFactory !== "function") {
    throw new TypeError("transportFactory must be a function");
  }

  const domain = createTradingDomain({ ledger, proposalInbox });
  const continuous = createContinuousTradingSupervisor({
    runtime: supervisorRuntime,
    ledger,
    readDecisionProposal: (request) => domain.readDecisionProposal(request),
    readReconciledOrder,
    proposalTimeoutMs,
    now,
    setTimeoutFn,
    clearTimeoutFn
  });
  const transport = await transportFactory({ ...transportOptions, domain });
  if (
    transport === null
    || typeof transport !== "object"
    || typeof transport.baseUrl !== "string"
    || typeof transport.callerToken !== "string"
    || typeof transport.close !== "function"
  ) {
    throw new TypeError("transportFactory must return a Trading Domain transport runtime");
  }

  let activeHandle = null;
  let transportClosePromise = null;
  let closePromise = null;

  function closeMcpTransport() {
    if (transportClosePromise === null) {
      transportClosePromise = Promise.resolve().then(() => transport.close());
    }
    return transportClosePromise;
  }

  async function startEpisode(options) {
    if (activeHandle?.status.running === true) {
      throw new Error("Trading Runtime Host already has an active Supervisor loop");
    }
    const handle = await continuous.start(options);
    activeHandle = handle;
    return handle;
  }

  function mcpEnvironment() {
    return Object.freeze({
      MARKET_FLOW_US_TRADING_DOMAIN_URL: transport.baseUrl,
      MARKET_FLOW_US_TRADING_DOMAIN_TOKEN: transport.callerToken
    });
  }

  function close() {
    if (closePromise === null) {
      closePromise = (async () => {
        if (activeHandle?.status.running === true) {
          activeHandle.stop();
        }
        if (activeHandle) {
          await activeHandle.done;
        }
        await closeMcpTransport();
      })();
    }
    return closePromise;
  }

  return Object.freeze({
    version: TRADING_RUNTIME_HOST_VERSION,
    domain,
    continuous,
    startEpisode,
    mcpEnvironment,
    closeMcpTransport,
    close,
    get supervisorStatus() {
      return continuous.status;
    }
  });
}
