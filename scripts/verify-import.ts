import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

/** Post-import sanity checks. Run with: pnpm tsx scripts/verify-import.ts */
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Catches the XML-entity failure mode: if the DTD entities were not
    // registered, every <pos> comes back empty and the app looks fine until you
    // notice no word has a part of speech.
    const { rows: pos } = await client.query(`
      SELECT count(*) FILTER (WHERE pos = '{}' OR pos IS NULL)::int AS empty,
             count(*)::int AS total
      FROM senses
    `);
    console.log(
      `senses without pos: ${pos[0].empty} / ${pos[0].total}`,
      pos[0].empty / pos[0].total < 0.05 ? "OK" : "FAIL",
    );

    // The prefix index must actually be used; a Seq Scan over 751k rows would
    // still return correct results, just slowly enough to matter.
    const { rows: plan } = await client.query(
      `EXPLAIN ANALYZE SELECT * FROM search_terms WHERE term LIKE 'ねこ%' LIMIT 50`,
    );
    const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
    console.log(
      "prefix search uses index:",
      /Index (Scan|Only Scan)/.test(planText) ? "OK" : "FAIL — Seq Scan",
    );
    console.log("  " + planText.split("\n")[0]);

    // The four documented search paths, all expected to reach 猫 (entry 1467640).
    const NEKO = 1467640;
    const probes: Array<[string, string]> = [
      ["kanji/kana prefix", `st.term LIKE 'ねこ%' AND st.term_type IN ('kanji','kana')`],
      ["romaji", `st.term LIKE 'neko%' AND st.term_type = 'romaji'`],
    ];
    for (const [label, where] of probes) {
      const { rows } = await client.query(
        `SELECT count(*) FILTER (WHERE st.entry_id = ${NEKO})::int AS hit,
                count(*)::int AS total
         FROM search_terms st WHERE ${where}`,
      );
      console.log(
        `${label}: ${rows[0].total} matches, 猫 present: ${rows[0].hit > 0 ? "OK" : "FAIL"}`,
      );
    }

    const { rows: gloss } = await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE entry_id = ${NEKO})::int AS hit
      FROM entry_search
      WHERE gloss_tsv @@ plainto_tsquery('english', 'cat')
    `);
    console.log(
      `english gloss FTS "cat": ${gloss[0].total} matches, 猫 present: ${gloss[0].hit > 0 ? "OK" : "FAIL"}`,
    );

    const { rows: fuzzy } = await client.query(`
      SELECT count(DISTINCT entry_id)::int AS total
      FROM search_terms WHERE term % 'nekko'
    `);
    console.log(
      `trigram fallback "nekko": ${fuzzy[0].total} entries`,
      fuzzy[0].total > 0 ? "OK" : "FAIL",
    );

    const { rows: furi } = await client.query(
      `SELECT ruby FROM furigana WHERE kanji_text = '猫' AND reading_kana = 'ねこ'`,
    );
    console.log(
      "furigana for 猫/ねこ:",
      furi.length ? JSON.stringify(furi[0].ruby) : "MISSING",
    );

    const { rows: sample } = await client.query(
      `SELECT headword, reading, romaji, left(gloss_summary, 60) AS gloss
       FROM entry_search WHERE entry_id = ${NEKO}`,
    );
    console.log("\nentry_search row for 猫:");
    console.table(sample);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("verify failed:", error.message);
  process.exit(1);
});
