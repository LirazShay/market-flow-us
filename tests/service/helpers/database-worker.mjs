import { openMarketScopeDatabase } from "../../../local-service/database/database.js";
import { REQUIRED_TABLES } from "../../../local-service/database/schema.js";

const [mode, dbPath] = process.argv.slice(2);

async function rows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

async function main() {
  if (!mode || !dbPath) throw new Error("mode and dbPath are required");

  if (mode === "expect-unsupported") {
    try {
      await openMarketScopeDatabase({ dbPath });
    } catch (error) {
      if (error?.code === "DB_SCHEMA_UNSUPPORTED") {
        process.stdout.write(JSON.stringify({ code: error.code }) + "\n");
        return;
      }
      throw error;
    }
    throw new Error("Expected DB_SCHEMA_UNSUPPORTED");
  }

  const database = await openMarketScopeDatabase({
    dbPath,
    now: () => 1700000000000
  });

  try {
    if (mode === "bootstrap") {
      const tables = await rows(
        database.viewerReadConnection,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
      );
      process.stdout.write(JSON.stringify({
        tables: tables.map((row) => row.table_name),
        required: REQUIRED_TABLES
      }) + "\n");
      return;
    }

    if (mode === "seed-running") {
      await database.writerConnection.run(`
        INSERT INTO sessions (
          session_id,
          producer_instance_id,
          status,
          started_at_ms,
          stopped_at_ms,
          stop_reason,
          last_heartbeat_at_ms,
          completed_cycles,
          failed_cycles,
          last_completed_cycle_id,
          last_completed_at_ms,
          config_json,
          last_error_json
        ) VALUES (
          'session-stale',
          'producer-test',
          'running',
          100,
          NULL,
          NULL,
          200,
          0,
          0,
          NULL,
          NULL,
          '{}',
          NULL
        )
      `);
      process.stdout.write(JSON.stringify({ seeded: true }) + "\n");
      return;
    }

    if (mode === "inspect-stale") {
      const result = await rows(
        database.viewerReadConnection,
        "SELECT status, stopped_at_ms, stop_reason FROM sessions WHERE session_id = 'session-stale'"
      );
      process.stdout.write(JSON.stringify(result[0] ?? null) + "\n");
      return;
    }

    if (mode === "set-unsupported") {
      await database.writerConnection.run("UPDATE schema_info SET schema_version = 99");
      process.stdout.write(JSON.stringify({ schemaVersion: 99 }) + "\n");
      return;
    }

    throw new Error(`Unknown mode: ${mode}`);
  } finally {
    await database.close();
  }
}

await main();
