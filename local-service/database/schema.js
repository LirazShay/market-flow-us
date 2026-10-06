export const LEGACY_SCHEMA_VERSION = 1;
export const SCHEMA_VERSION = 2;
export const MARKET_FLOW_US_V3_SCHEMA_VERSION = 3;
export const MARKET_FLOW_US_SCHEMA_VERSION = 4;

export const MARKET_AUTHORITY_TABLES = Object.freeze([
  "schema_info",
  "sessions",
  "universe",
  "cycles",
  "history",
  "latest"
]);

export const SAVED_QUERIES_TABLE = "scanner_saved_queries";
export const DEMO_BUY_CAPTURES_TABLE = "demo_buy_captures";
export const DEMO_BUY_ITEMS_TABLE = "demo_buy_items";
export const DEMO_BUY_TABLES = Object.freeze([
  DEMO_BUY_CAPTURES_TABLE,
  DEMO_BUY_ITEMS_TABLE
]);

export const LEGACY_V1_REQUIRED_TABLES = MARKET_AUTHORITY_TABLES;
export const REQUIRED_TABLES = Object.freeze([
  ...MARKET_AUTHORITY_TABLES,
  SAVED_QUERIES_TABLE
]);
export const MARKET_FLOW_US_V3_REQUIRED_TABLES = REQUIRED_TABLES;
export const MARKET_FLOW_US_REQUIRED_TABLES = Object.freeze([
  ...MARKET_FLOW_US_V3_REQUIRED_TABLES,
  ...DEMO_BUY_TABLES
]);

const CREATE_SCHEMA_INFO_TABLE = `CREATE TABLE schema_info (
  schema_version INTEGER NOT NULL,
  created_at_ms BIGINT NOT NULL,
  product_version VARCHAR NOT NULL
)`;

const CREATE_SESSIONS_TABLE = `CREATE TABLE sessions (
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
)`;

const CREATE_CYCLES_TABLE = `CREATE TABLE cycles (
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
)`;

const legacyHistoryColumns = `
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

const marketFlowUsHistoryColumns = `
  cycle_id BIGINT NOT NULL,
  session_id VARCHAR NOT NULL,
  universe_revision BIGINT NOT NULL,
  security_id VARCHAR NOT NULL,
  chunk_index INTEGER NOT NULL,
  cycle_started_at_ms BIGINT NOT NULL,
  chunk_received_at_ms BIGINT NOT NULL,
  collected_at_ms BIGINT NOT NULL,
  source_metadata_json JSON NULL,

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

export const CREATE_DEMO_BUY_CAPTURES_TABLE = `CREATE TABLE demo_buy_captures (
  capture_id BIGINT PRIMARY KEY CHECK (capture_id > 0),
  captured_at_ms BIGINT NOT NULL CHECK (captured_at_ms >= 0),
  source_query_id VARCHAR NULL,
  source_query_name VARCHAR NULL,
  source_query_sql VARCHAR NOT NULL,
  source_interval_ms BIGINT NOT NULL CHECK (source_interval_ms > 0),
  source_result_started_at_ms BIGINT NOT NULL CHECK (source_result_started_at_ms >= 0),
  source_result_completed_at_ms BIGINT NOT NULL CHECK (source_result_completed_at_ms >= 0),
  source_result_row_count BIGINT NOT NULL CHECK (source_result_row_count >= 0),
  source_result_context_json JSON NOT NULL,
  selection_mode VARCHAR NOT NULL CHECK (selection_mode IN ('manual', 'all', 'top_x')),
  is_automatic BOOLEAN NOT NULL,
  top_x BIGINT NULL,
  CHECK (
    (selection_mode = 'top_x' AND top_x BETWEEN 1 AND 5000)
    OR (selection_mode IN ('manual', 'all') AND top_x IS NULL)
  ),
  CHECK (NOT is_automatic OR selection_mode IN ('all', 'top_x'))
)`;

export const CREATE_DEMO_BUY_ITEMS_TABLE = `CREATE TABLE demo_buy_items (
  capture_id BIGINT NOT NULL CHECK (capture_id > 0),
  result_rank BIGINT NOT NULL CHECK (result_rank > 0),
  security_id VARCHAR NOT NULL CHECK (length(security_id) > 0),
  buy_cycle_id BIGINT NOT NULL CHECK (buy_cycle_id > 0),
  PRIMARY KEY (capture_id, security_id),
  UNIQUE (capture_id, result_rank)
)`;

export const LEGACY_V1_SCHEMA_STATEMENTS = Object.freeze([
  CREATE_SCHEMA_INFO_TABLE,
  CREATE_SESSIONS_TABLE,
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
  CREATE_CYCLES_TABLE,
  `CREATE TABLE history (
    ${legacyHistoryColumns},
    PRIMARY KEY (cycle_id, security_id)
  )`,
  `CREATE TABLE latest (
    ${legacyHistoryColumns},
    PRIMARY KEY (security_id)
  )`
]);

export const CREATE_SCHEMA_STATEMENTS = Object.freeze([
  ...LEGACY_V1_SCHEMA_STATEMENTS,
  CREATE_SAVED_QUERIES_TABLE
]);

export const MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS = Object.freeze([
  CREATE_SCHEMA_INFO_TABLE,
  CREATE_SESSIONS_TABLE,
  `CREATE TABLE universe (
    security_id VARCHAR PRIMARY KEY,
    is_current BOOLEAN NOT NULL,
    universe_revision BIGINT NOT NULL,
    first_seen_at_ms BIGINT NOT NULL,
    last_seen_at_ms BIGINT NOT NULL,
    Symbol VARCHAR NULL,
    PaperNameEng VARCHAR NULL,
    PaperNameHeb VARCHAR NULL,
    ExchangeName VARCHAR NULL,
    raw_source JSON NOT NULL
  )`,
  CREATE_CYCLES_TABLE,
  `CREATE TABLE history (
    ${marketFlowUsHistoryColumns},
    PRIMARY KEY (cycle_id, security_id)
  )`,
  `CREATE TABLE latest (
    ${marketFlowUsHistoryColumns},
    PRIMARY KEY (security_id)
  )`,
  CREATE_SAVED_QUERIES_TABLE
]);

export const MARKET_FLOW_US_CREATE_SCHEMA_STATEMENTS = Object.freeze([
  ...MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS,
  CREATE_DEMO_BUY_CAPTURES_TABLE,
  CREATE_DEMO_BUY_ITEMS_TABLE
]);
