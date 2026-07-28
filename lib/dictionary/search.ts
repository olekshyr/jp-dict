import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import {
  detectScript,
  escapeLikePrefix,
  normalizeJapanese,
  normalizeRomaji,
} from "./query-script";

/** A single row in the search results list. */
export type SearchResult = {
  entryId: number;
  headword: string;
  reading: string;
  romaji: string;
  glossSummary: string;
  isCommon: boolean;
};

const LIMIT = 50;

type SearchRow = {
  entry_id: string | number;
  headword: string;
  reading: string;
  romaji: string;
  gloss_summary: string;
  is_common: boolean;
};

function toResults(rows: SearchRow[]): SearchResult[] {
  return rows.map((r) => ({
    entryId: Number(r.entry_id),
    headword: r.headword,
    reading: r.reading,
    romaji: r.romaji,
    glossSummary: r.gloss_summary,
    isCommon: r.is_common,
  }));
}

/**
 * Searches the dictionary.
 *
 * Cached with `cacheLife('max')` because JMdict is immutable between imports —
 * a repeated query is free, and popular queries land in the static shell. The
 * `dictionary` tag lets a re-import invalidate everything at once.
 *
 * Note this deliberately knows nothing about the current user: results are
 * identical for everyone, which is what makes them shareable and cacheable.
 * "Is this word already in my list?" is fetched separately.
 */
export async function searchEntries(rawQuery: string): Promise<SearchResult[]> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

  const script = detectScript(rawQuery);
  if (script === "empty") return [];

  if (script === "japanese") {
    const term = normalizeJapanese(rawQuery);
    const prefix = escapeLikePrefix(term);

    /*
     * Prefix match against kanji and kana surface forms. Postgres has no
     * Japanese tokenizer, so this is a `text_pattern_ops` btree range scan
     * rather than full-text search — which is also how dictionary lookup
     * actually behaves.
     */
    const rows = await db.execute<SearchRow>(sql`
      SELECT
        es.entry_id,
        es.headword,
        es.reading,
        es.romaji,
        es.gloss_summary,
        es.is_common
      FROM search_terms st
      JOIN entry_search es ON es.entry_id = st.entry_id
      WHERE st.term LIKE ${prefix} ESCAPE '\\'
        AND st.term_type IN ('kanji', 'kana')
      GROUP BY es.entry_id, es.headword, es.reading, es.romaji,
               es.gloss_summary, es.is_common, es.freq_rank
      ORDER BY
        bool_or(st.term = ${term}) DESC,
        min(st.weight) ASC,
        min(length(st.term)) ASC,
        es.is_common DESC,
        es.freq_rank ASC NULLS LAST
      LIMIT ${LIMIT}
    `);

    const results = toResults(rows.rows as SearchRow[]);
    return results.length > 0 ? results : fuzzy(term);
  }

  // Latin input is ambiguous — it could be romaji or an English gloss, so try
  // both and rank romaji hits above gloss hits.
  const romaji = normalizeRomaji(rawQuery);
  const prefix = escapeLikePrefix(romaji);
  const english = rawQuery.trim();

  const rows = await db.execute<SearchRow>(sql`
    WITH romaji_hits AS (
      SELECT
        st.entry_id,
        0 AS source,
        bool_or(st.term = ${romaji}) AS exact,
        min(length(st.term)) AS len
      FROM search_terms st
      WHERE st.term LIKE ${prefix} ESCAPE '\\'
        AND st.term_type = 'romaji'
      GROUP BY st.entry_id
    ),
    gloss_hits AS (
      SELECT
        es.entry_id,
        1 AS source,
        false AS exact,
        0 AS len
      FROM entry_search es
      WHERE es.gloss_tsv @@ plainto_tsquery('english', ${english})
    ),
    merged AS (
      SELECT DISTINCT ON (entry_id) entry_id, source, exact, len
      FROM (SELECT * FROM romaji_hits UNION ALL SELECT * FROM gloss_hits) u
      ORDER BY entry_id, source ASC
    )
    SELECT
      es.entry_id,
      es.headword,
      es.reading,
      es.romaji,
      es.gloss_summary,
      es.is_common
    FROM merged m
    JOIN entry_search es ON es.entry_id = m.entry_id
    ORDER BY
      m.exact DESC,
      m.source ASC,
      es.is_common DESC,
      es.freq_rank ASC NULLS LAST,
      m.len ASC
    LIMIT ${LIMIT}
  `);

  const results = toResults(rows.rows as SearchRow[]);
  return results.length > 0 ? results : fuzzy(romaji);
}

/**
 * Typo-tolerant fallback, only reached when an exact prefix search found
 * nothing. Uses the pg_trgm similarity index on `search_terms.term`.
 */
async function fuzzy(term: string): Promise<SearchResult[]> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

  const rows = await db.execute<SearchRow>(sql`
    SELECT
      es.entry_id,
      es.headword,
      es.reading,
      es.romaji,
      es.gloss_summary,
      es.is_common
    FROM search_terms st
    JOIN entry_search es ON es.entry_id = st.entry_id
    WHERE st.term % ${term}
    GROUP BY es.entry_id, es.headword, es.reading, es.romaji,
             es.gloss_summary, es.is_common, es.freq_rank
    ORDER BY
      max(similarity(st.term, ${term})) DESC,
      es.is_common DESC,
      es.freq_rank ASC NULLS LAST
    LIMIT ${LIMIT}
  `);

  return toResults(rows.rows as SearchRow[]);
}
