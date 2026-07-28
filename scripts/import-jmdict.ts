import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { config } from "dotenv";
import { toRomaji } from "wanakana";

import {
  parseJMdict,
  readDtdEntities,
  type JMdictEntry,
} from "./jmdict-parser";

config({ path: ".env.local" });

/**
 * Loads JMdict into Postgres. One-shot, idempotent, run manually:
 *
 *   pnpm db:import [path/to/JMdict_e.xml] [path/to/JmdictFurigana.json]
 *
 * Uses a plain `pg` TCP connection rather than the app's neon-http driver:
 * neon-http is one HTTP round-trip per statement, which is the right trade-off
 * for serverless request handling and the wrong one for ~1.5M rows.
 */

const XML_PATH = process.argv[2] ?? "data/JMdict_e.xml";
const FURIGANA_PATH = process.argv[3] ?? "data/JmdictFurigana.json";

/** JMdict priority codes that mark an entry as common. */
const COMMON_PRIORITY = new Set([
  "news1",
  "ichi1",
  "spec1",
  "spec2",
  "gai1",
]);

/** Postgres caps a statement at 65535 bound parameters. */
const MAX_PARAMS = 60000;

/** Entries buffered before every table is flushed in dependency order. */
const FLUSH_EVERY_ENTRIES = 2000;

type Row = readonly unknown[];

/**
 * Accumulates rows and writes them as multi-row INSERTs.
 *
 * Deliberately does *not* flush on its own when full. Each table's rows
 * reference the previous table's, so an independent flush can emit child rows
 * before their parents exist and trip a foreign key. Flushing is driven by the
 * caller, which drains every table together in dependency order.
 */
class Batcher {
  private rows: Row[] = [];
  private readonly chunkSize: number;
  total = 0;

  constructor(
    private readonly client: Client,
    private readonly table: string,
    private readonly columns: string[],
  ) {
    this.chunkSize = Math.floor(MAX_PARAMS / columns.length);
  }

  push(row: Row): void {
    this.rows.push(row);
  }

  /**
   * Synchronously detaches the buffered rows.
   *
   * Must stay synchronous: the caller takes all tables' buffers in one go to
   * get a consistent cut. Pausing the XML stream does not stop the in-flight
   * chunk, so entries keep arriving during a flush — if a parent table were
   * drained before an await and a child table after it, the child batch could
   * contain rows whose parents are still buffered.
   */
  take(): Row[] {
    const rows = this.rows;
    this.rows = [];
    return rows;
  }

  async insert(rows: Row[]): Promise<void> {
    if (rows.length === 0) return;

    const width = this.columns.length;
    const cols = this.columns.map((c) => `"${c}"`).join(",");

    // A buffered batch can still exceed the bind-parameter cap, so split it.
    for (let start = 0; start < rows.length; start += this.chunkSize) {
      const chunk = rows.slice(start, start + this.chunkSize);
      const placeholders = chunk
        .map(
          (_, r) =>
            `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(",")})`,
        )
        .join(",");

      await this.client.query(
        `INSERT INTO "${this.table}" (${cols}) VALUES ${placeholders}`,
        chunk.flat(),
      );
    }
    this.total += rows.length;
  }
}

/** Extracts `isCommon` / `freqRank` from JMdict ke_pri / re_pri codes. */
function summarizePriority(codes: string[]): {
  isCommon: boolean;
  freqRank: number | null;
} {
  let isCommon = false;
  let freqRank: number | null = null;

  for (const code of codes) {
    if (COMMON_PRIORITY.has(code)) isCommon = true;
    // nf01..nf48 buckets, lowest is most frequent.
    const nf = /^nf(\d+)$/.exec(code);
    if (nf) {
      const rank = Number(nf[1]);
      if (freqRank === null || rank < freqRank) freqRank = rank;
    }
  }

  return { isCommon, freqRank };
}

/**
 * Indexes on the search tables, dropped for the bulk build and recreated after.
 * Building a GIN trigram index once over a finished table is far cheaper than
 * maintaining it across ~900k inserts.
 *
 * These must stay in sync with lib/db/schema.ts.
 */
const SEARCH_INDEXES: Array<{ name: string; create: string }> = [
  {
    name: "search_terms_prefix_idx",
    create: `CREATE INDEX "search_terms_prefix_idx" ON "search_terms" USING btree ("term" text_pattern_ops)`,
  },
  {
    name: "search_terms_trgm_idx",
    create: `CREATE INDEX "search_terms_trgm_idx" ON "search_terms" USING gin ("term" gin_trgm_ops)`,
  },
  {
    name: "search_terms_entry_idx",
    create: `CREATE INDEX "search_terms_entry_idx" ON "search_terms" USING btree ("entry_id")`,
  },
  {
    name: "entry_search_tsv_idx",
    create: `CREATE INDEX "entry_search_tsv_idx" ON "entry_search" USING gin ("gloss_tsv")`,
  },
  {
    name: "entry_search_rank_idx",
    create: `CREATE INDEX "entry_search_rank_idx" ON "entry_search" USING btree ("is_common","freq_rank")`,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
    );
  }

  // Fail early and clearly if the source files are missing.
  for (const path of [XML_PATH, FURIGANA_PATH]) {
    await new Promise<void>((resolve, reject) => {
      const s = createReadStream(path);
      s.on("error", () =>
        reject(
          new Error(
            `Cannot read ${path}. Download JMdict_e.gz from edrdg.org and JmdictFurigana.json from github.com/Doublevil/JmdictFurigana into data/.`,
          ),
        ),
      );
      s.on("open", () => {
        s.close();
        resolve();
      });
    });
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // The dictionary tables cascade to user_words, so refuse to wipe saved
    // words silently.
    const saved = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM user_words`,
    );
    if (Number(saved.rows[0].count) > 0) {
      throw new Error(
        `user_words has ${saved.rows[0].count} rows. Re-importing truncates entries, which would cascade and delete them. ` +
          `Clear user_words first if you really want to re-import.`,
      );
    }

    console.log("Reading DTD entities…");
    const entities = await readDtdEntities(XML_PATH);
    console.log(`  ${Object.keys(entities).length} entities`);

    console.log("Truncating dictionary tables…");
    await client.query(
      `TRUNCATE entries, kanji_forms, readings, senses, glosses, furigana, search_terms, entry_search RESTART IDENTITY CASCADE`,
    );

    console.log("Dropping search indexes for bulk load…");
    for (const idx of SEARCH_INDEXES) {
      await client.query(`DROP INDEX IF EXISTS "${idx.name}"`);
    }

    const entriesB = new Batcher(client, "entries", [
      "id",
      "is_common",
      "freq_rank",
    ]);
    const kanjiB = new Batcher(client, "kanji_forms", [
      "id",
      "entry_id",
      "text",
      "is_common",
      "ord",
    ]);
    const readingsB = new Batcher(client, "readings", [
      "id",
      "entry_id",
      "kana",
      "romaji",
      "no_kanji",
      "restrictions",
      "is_common",
      "ord",
    ]);
    const sensesB = new Batcher(client, "senses", [
      "id",
      "entry_id",
      "ord",
      "pos",
      "field",
      "misc",
      "dialect",
      "info",
    ]);
    const glossesB = new Batcher(client, "glosses", [
      "id",
      "sense_id",
      "text",
      "lang",
      "type",
      "ord",
    ]);

    let kanjiId = 0;
    let readingId = 0;
    let senseId = 0;
    let glossId = 0;
    let entryCount = 0;
    let sensesWithoutPos = 0;

    /*
     * Order mirrors the foreign keys: kanji/readings/senses reference entries,
     * glosses reference senses.
     */
    const inFkOrder = [entriesB, kanjiB, readingsB, sensesB, glossesB];

    // Serializes overlapping flushes. onEntry can fire again while a flush is
    // awaiting, so without this two flushes could interleave their INSERTs.
    let flushChain: Promise<void> = Promise.resolve();

    const flushAll = (): Promise<void> => {
      // Synchronous cut: every row for a given entry is pushed in one
      // synchronous onEntry call, so taking all buffers without awaiting in
      // between guarantees no child is separated from its parent.
      const batches = inFkOrder.map((b) => [b, b.take()] as const);

      flushChain = flushChain.then(async () => {
        for (const [batcher, rows] of batches) {
          await batcher.insert(rows);
        }
      });
      return flushChain;
    };

    console.log("Parsing and loading entries…");
    const started = Date.now();

    await parseJMdict(XML_PATH, entities, (entry: JMdictEntry) => {
      entryCount++;

      const allPriority = [
        ...entry.kanji.flatMap((k) => k.priority),
        ...entry.readings.flatMap((r) => r.priority),
      ];
      const { isCommon, freqRank } = summarizePriority(allPriority);

      entriesB.push([entry.seq, isCommon, freqRank]);

      entry.kanji.forEach((k, i) => {
        const p = summarizePriority(k.priority);
        kanjiB.push([++kanjiId, entry.seq, k.text, p.isCommon, i]);
      });

      entry.readings.forEach((r, i) => {
        const p = summarizePriority(r.priority);
        readingsB.push([
          ++readingId,
          entry.seq,
          r.kana,
          toRomaji(r.kana),
          r.noKanji,
          r.restrictions,
          p.isCommon,
          i,
        ]);
      });

      entry.senses.forEach((s, i) => {
        if (s.pos.length === 0) sensesWithoutPos++;
        const id = ++senseId;
        sensesB.push([
          id,
          entry.seq,
          i,
          s.pos,
          s.field,
          s.misc,
          s.dialect,
          s.info,
        ]);
        s.glosses.forEach((g, gi) => {
          glossesB.push([++glossId, id, g.text, "eng", g.type, gi]);
        });
      });

      // Returning a promise pauses the XML stream until the batch is written.
      if (entryCount % FLUSH_EVERY_ENTRIES === 0) {
        return flushAll();
      }
      return undefined;
    });

    await flushAll();

    console.log(
      `  ${entryCount} entries, ${kanjiId} kanji forms, ${readingId} readings, ` +
        `${senseId} senses, ${glossId} glosses in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );

    /*
     * The DTD entities are the single most likely thing to break silently: if
     * sax does not resolve them, every <pos> comes back empty and the app looks
     * fine until you notice no word has a part of speech.
     */
    if (sensesWithoutPos > senseId * 0.05) {
      throw new Error(
        `${sensesWithoutPos} of ${senseId} senses have no part of speech. ` +
          `This almost always means the JMdict DTD entities were not registered with the parser.`,
      );
    }

    console.log("Loading furigana…");
    const furiganaRaw = await readFile(FURIGANA_PATH, "utf8");
    // The dataset ships with a UTF-8 BOM.
    const furiganaData: Array<{
      text: string;
      reading: string;
      furigana: Array<{ ruby: string; rt?: string }>;
    }> = JSON.parse(furiganaRaw.replace(/^﻿/, ""));

    const furiganaB = new Batcher(client, "furigana", [
      "kanji_text",
      "reading_kana",
      "ruby",
    ]);
    // The table is keyed by (text, reading); the dataset can repeat a pair.
    const seen = new Set<string>();
    for (const item of furiganaData) {
      const key = `${item.text}\u0000${item.reading}`;
      if (seen.has(key)) continue;
      seen.add(key);
      furiganaB.push([
        item.text,
        item.reading,
        JSON.stringify(item.furigana),
      ]);
    }
    // No foreign keys on this table, so one chunked insert at the end is fine.
    await furiganaB.insert(furiganaB.take());
    console.log(`  ${furiganaB.total} furigana alignments`);

    console.log("Building search_terms…");
    // Weights drive ranking: common kanji first, then common kana, then the
    // rest, with romaji last since it is the fuzziest signal.
    await client.query(`
      INSERT INTO search_terms (id, entry_id, term, term_type, weight)
      SELECT
        row_number() OVER (),
        entry_id,
        term,
        term_type,
        weight
      FROM (
        SELECT entry_id, text AS term, 'kanji' AS term_type,
               CASE WHEN is_common THEN 0 ELSE 2 END AS weight
        FROM kanji_forms
        UNION ALL
        SELECT entry_id, kana, 'kana',
               CASE WHEN is_common THEN 1 ELSE 2 END
        FROM readings
        UNION ALL
        SELECT DISTINCT entry_id, romaji, 'romaji', 3
        FROM readings
        WHERE romaji <> ''
      ) AS t
    `);

    console.log("Building entry_search…");
    await client.query(`
      INSERT INTO entry_search (
        entry_id, headword, reading, romaji, gloss_summary, gloss_blob,
        is_common, freq_rank
      )
      SELECT
        e.id,
        COALESCE(k.text, r.kana),
        COALESCE(r.kana, ''),
        COALESCE(r.romaji, ''),
        COALESCE(g.summary, ''),
        COALESCE(g.blob, ''),
        e.is_common,
        e.freq_rank
      FROM entries e
      LEFT JOIN LATERAL (
        SELECT text FROM kanji_forms WHERE entry_id = e.id ORDER BY ord LIMIT 1
      ) k ON true
      LEFT JOIN LATERAL (
        SELECT kana, romaji FROM readings WHERE entry_id = e.id ORDER BY ord LIMIT 1
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT
          string_agg(gl.text, '; ' ORDER BY s.ord, gl.ord)
            FILTER (WHERE s.ord < 3) AS summary,
          string_agg(gl.text, ' ' ORDER BY s.ord, gl.ord) AS blob
        FROM senses s
        JOIN glosses gl ON gl.sense_id = s.id
        WHERE s.entry_id = e.id
      ) g ON true
    `);

    console.log("Recreating search indexes…");
    for (const idx of SEARCH_INDEXES) {
      process.stdout.write(`  ${idx.name}… `);
      const t = Date.now();
      await client.query(idx.create);
      console.log(`${((Date.now() - t) / 1000).toFixed(1)}s`);
    }

    console.log("Analyzing…");
    await client.query(`ANALYZE entries, kanji_forms, readings, senses, glosses, furigana, search_terms, entry_search`);

    const counts = await client.query<{ table: string; n: string }>(`
      SELECT 'entries' AS table, count(*)::text AS n FROM entries
      UNION ALL SELECT 'kanji_forms', count(*)::text FROM kanji_forms
      UNION ALL SELECT 'readings', count(*)::text FROM readings
      UNION ALL SELECT 'senses', count(*)::text FROM senses
      UNION ALL SELECT 'glosses', count(*)::text FROM glosses
      UNION ALL SELECT 'furigana', count(*)::text FROM furigana
      UNION ALL SELECT 'search_terms', count(*)::text FROM search_terms
      UNION ALL SELECT 'entry_search', count(*)::text FROM entry_search
    `);

    console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.table(counts.rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("\nImport failed:", error.message);
  process.exit(1);
});
