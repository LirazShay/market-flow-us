export const LEGACY_SCHEMA_VERSION = 1;
export const SCHEMA_VERSION = 2;

export const MARKET_AUTHORITY_TABLES = Object.freeze([
  "schema_info",
  "sessions",
  "universe",
  "cycles",
  "history",
  "latest"
]);

export const SAVED_QUERIES_TABLE = "scanner_saved_queries";

export const LEGACY_V1_REQUIRED_TABLES = MARKET_AUTHORITY_TABLES;
export const REQUIRED_TABLES = Object.freeze([
  ...MARKET_AUTHORITY_TABLES,
  SAVED_QUERIES_TABLE
]);

const historyColumns = `
  cycle_id BIGINT NOT NULL,
  session_id VARCHAR NOT NULL,
  universe_revision BIGINT NOT NULL,
  security_id VARCHAR NOT NULL,
  chunk_index INTEGER NOT NULL,
  cycle_started_at_ms BIGINT NOT NULL,
  chunk_received_at_ms BIGINT NOT NULL,
  collected_at_ms BIGINT NOT NULL,
  server_as_of_date_json JSON NULL,

  LastKnownRate DOUBLE NULL,
  BaseRateChangePercentage DOUBLE NULL,
  BuyLimit1 DOUBLE NULL,
  BuyVolume1 DOUBLE NULL,
  SellLimit1 DOUBLE NULL,
  SellVolume1 DOUBLE NULL,
  DailyDealsQuantity DOUBLE NULL,
  LastDealVolume DOUBLE NULL,
  DailyTurnover DOUBLE NULL,
  DailyNISRevenue DOUBLE NULL,
  DailyLowestRate DOUBLE NULL,
  DailyHighestRate DOUBLE NULL,
  LastDealTimeOnly VARCHAR NULL,

  raw_data JSON NOT NULL
`;

export const CREATE_SAVED_QUERIES_TABLE = `CREATE TABLE scanner_saved_queries (
  query_id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  name_key VARCHAR NOT NULL UNIQUE,
  sql_text VARCHAR NOT NULL,
  interval_ms BIGINT NOT NULL CHECK (interval_ms > 0),
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
)`;

export const LEGACY_V1_SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE schema_info (
    schema_version INTEGER NOT NULL,
    created_at_ms BIGINT NOT NULL,
    product_version VARCHAR NOT NULL
  )`,
  `CREATE TABLE sessions (
    session_id VARCHAR PRIMARY KEY,
    producer_instance_id VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    started_at_ms BIGINT NOT NULL,
    stopped_at_ms BIGINT NULL,
    stop_reason VARCHAR NULL,
    last_heartbeat_at_ms BIGINT NOT NULL,
    completed_cycles BIGINT NOT NULL,
    failed_cycles BIGINT NOT NULL,
    last_completed_cycle_id BIGINT NULL,
    last_completed_at_ms BIGINT NULL,
    config_json JSON NOT NULL,
    last_error_json JSON NULL
  )`,
  `CREATE TABLE universe (
    security_id VARCHAR PRIMARY KEY,
    is_current BOOLEAN NOT NULL,
    universe_revision BIGINT NOT NULL,
    first_seen_at_ms BIGINT NOT NULL,
    last_seen_at_ms BIGINT NOT NULL,
    paper_name VARCHAR NULL,
    map_heat_date_change_json JSON NULL,
    raw_map_heat JSON NOT NULL
  )`,
  `CREATE TABLE cycles (
    cycle_id BIGINT PRIMARY KEY,
    session_id VARCHAR NOT NULL,
    universe_revision BIGINT NULL,
    status VARCHAR NOT NULL,
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
    chunk_count INTEGER NULL,
    chunks_json JSON NULL,
    failure_phase VARCHAR NULL,
    error_json JSON NULL
  )`,
  `CREATE TABLE history (
    ${historyColumns},
    PRIMARY KEY (cycle_id, security_id)
  )`,
  `CREATE TABLE latest (
    ${historyColumns},
    PRIMARY KEY (security_id)
  )`
]);

export const CREATE_SCHEMA_STATEMENTS = Object.freeze([
  ...LEGACY_V1_SCHEMA_STATEMENTS,
  CREATE_SAVED_QUERIES_TABLE
]);
