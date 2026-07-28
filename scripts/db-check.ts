import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Connectivity and schema smoke test. Run with: pnpm tsx scripts/db-check.ts
 *
 * Uses a direct pg connection rather than the Neon CLI so it exercises the same
 * path the application does.
 */
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: ping } = await client.query("SELECT 1 AS ok");
    console.log("connection:", ping[0].ok === 1 ? "ok" : "FAILED");

    const { rows: version } = await client.query("SHOW server_version");
    console.log("postgres:", version[0].server_version);

    const { rows: ext } = await client.query(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
    );
    console.log("pg_trgm:", ext.length ? "installed" : "MISSING");

    const { rows: tables } = await client.query(`
      SELECT table_name, (
        SELECT count(*) FROM information_schema.columns c
        WHERE c.table_name = t.table_name AND c.table_schema = 'public'
      )::int AS columns
      FROM information_schema.tables t
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log("\ntables:");
    console.table(tables);

    // The two indexes that depend on operator classes are the ones most likely
    // to have silently failed.
    const { rows: idx } = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('search_terms_prefix_idx', 'search_terms_trgm_idx', 'entry_search_tsv_idx')
      ORDER BY indexname
    `);
    console.log("\ncritical indexes:");
    for (const row of idx) {
      console.log(`  ${row.indexname}: ${row.indexdef.split(" USING ")[1]}`);
    }
    if (idx.length < 3) {
      console.log(`  WARNING: expected 3, found ${idx.length}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("db-check failed:", error.message);
  process.exit(1);
});
