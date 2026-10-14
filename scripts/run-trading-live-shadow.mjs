import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CpgwAdapter,
  createCpgwTransport
} from "../ibkr-order-service/cpgw-adapter.js";
import { openTradingLedger } from "../trading-server/ledger.js";
import { runLiveMarketShadowObservation } from "../trading-server/live-shadow-acceptance.js";
import { readCleanCheckoutCommit } from "./clean-checkout-commit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DB_PATH = "data/trading-live-shadow-acceptance.duckdb";
const DEFAULT_CPGW_URL = "https://localhost:5000/v1/api";

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const config = {
    symbol: null,
    secType: "STK",
    currency: "USD",
    exchange: "SMART",
    cpgwUrl: DEFAULT_CPGW_URL,
    allowInsecureLoopbackTls: false,
    maxQuoteAgeMs: 1_000,
    timeoutMs: 10_000,
    dbPath: DEFAULT_DB_PATH,
    help: false
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      config.help = true;
    } else if (arg === "--allow-insecure-loopback-tls") {
      config.allowInsecureLoopbackTls = true;
    } else if (arg.startsWith("--symbol=")) {
      config.symbol = arg.slice("--symbol=".length).trim().toUpperCase();
    } else if (arg.startsWith("--sec-type=")) {
      config.secType = arg.slice("--sec-type=".length).trim().toUpperCase();
    } else if (arg.startsWith("--currency=")) {
      config.currency = arg.slice("--currency=".length).trim().toUpperCase();
    } else if (arg.startsWith("--exchange=")) {
      config.exchange = arg.slice("--exchange=".length).trim().toUpperCase();
    } else if (arg.startsWith("--cpgw-url=")) {
      config.cpgwUrl = arg.slice("--cpgw-url=".length).trim();
    } else if (arg.startsWith("--max-quote-age-ms=")) {
      config.maxQuoteAgeMs = parsePositiveInteger(
        arg.slice("--max-quote-age-ms=".length),
        "--max-quote-age-ms"
      );
    } else if (arg.startsWith("--timeout-ms=")) {
      config.timeoutMs = parsePositiveInteger(arg.slice("--timeout-ms=".length), "--timeout-ms");
    } else if (arg.startsWith("--db=")) {
      config.dbPath = arg.slice("--db=".length).trim();
    } else {
      throw new TypeError(`Unknown argument: ${arg}`);
    }
  }

  if (!config.help && !config.symbol) {
    throw new TypeError("--symbol is required");
  }
  if (!config.help && !config.dbPath) {
    throw new TypeError("--db must not be empty");
  }
  return Object.freeze(config);
}

function usage() {
  return [
    "Usage: npm run trading-live-shadow -- --symbol=AAPL [options]",
    "",
    "Read-only options:",
    "  --sec-type=STK",
    "  --currency=USD",
    "  --exchange=SMART",
    "  --cpgw-url=https://localhost:5000/v1/api",
    "  --allow-insecure-loopback-tls",
    "  --max-quote-age-ms=1000",
    "  --timeout-ms=10000",
    `  --db=${DEFAULT_DB_PATH}`,
    "",
    "Acceptance evidence requires a clean Git checkout and records the exact candidateCommit.",
    "This runner performs market-data observation only. It never enables synthetic, DRY_RUN or LIVE order execution."
  ].join("\n");
}

function boundedErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,128}$/u.test(error.code)
    ? error.code
    : "LIVE_SHADOW_RUNNER_FAILED";
}

let ledger = null;
try {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(usage());
  } else {
    const candidateCommit = await readCleanCheckoutCommit({ root: ROOT });
    const dbPath = path.resolve(config.dbPath);
    const requestJson = createCpgwTransport({
      baseUrl: config.cpgwUrl,
      allowInsecureLoopbackTls: config.allowInsecureLoopbackTls,
      timeoutMs: config.timeoutMs
    });
    const adapter = new CpgwAdapter({ requestJson });
    ledger = await openTradingLedger({ dbPath });

    const report = await runLiveMarketShadowObservation({
      ledger,
      adapter,
      instrument: {
        symbol: config.symbol,
        secType: config.secType,
        currency: config.currency,
        exchange: config.exchange
      },
      maxQuoteAgeMs: config.maxQuoteAgeMs
    });
    const evidenceReport = Object.freeze({
      ...report,
      candidateCommit,
      checkoutClean: true
    });
    console.log(JSON.stringify(evidenceReport, null, 2));
    if (evidenceReport.status !== "PASS") process.exitCode = 1;
  }
} catch (error) {
  console.log(JSON.stringify({
    schemaVersion: 1,
    check: "LIVE_MARKET_SHADOW_OBSERVATION",
    status: "ERROR",
    reasonCode: boundedErrorCode(error),
    candidateCommit: null,
    checkoutClean: false,
    nextStageEnabled: false
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (ledger) await ledger.close();
}
