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

/** `search_terms.term_type` values each script may match against. */
const JAPANESE_TERMS = ["kanji", "kana"] as const;
const LATIN_TERMS = ["romaji"] as const;

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
    return results.length > 0 ? results : fuzzy(term, JAPANESE_TERMS);
  }

  /*
   * Latin input is ambiguous — it could be romaji or an English gloss, so try
   * both and rank romaji hits above gloss hits.
   *
   * Both arms match strictly: romaji by equality, English by whole word
   * against the unstemmed `simple` tsvector. A prefix match here would mean
   * the English word "man" pulling in まんが and まんなか ahead of anything
   * that means "man", which is noise rather than a longer list.
   */
  const romaji = normalizeRomaji(rawQuery);
  const english = rawQuery.trim();

  const rows = await db.execute<SearchRow>(sql`
    WITH romaji_hits AS (
      SELECT DISTINCT st.entry_id, 0 AS source
      FROM search_terms st
      WHERE st.term = ${romaji}
        AND st.term_type = 'romaji'
    ),
    gloss_hits AS (
      SELECT es.entry_id, 1 AS source
      FROM entry_search es
      WHERE es.gloss_tsv @@ plainto_tsquery('simple', ${english})
    ),
    merged AS (
      SELECT DISTINCT ON (entry_id) entry_id, source
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
      m.source ASC,
      es.is_common DESC,
      es.freq_rank ASC NULLS LAST
    LIMIT ${LIMIT}
  `);

  const results = toResults(rows.rows as SearchRow[]);
  return results.length > 0 ? results : fuzzy(romaji, LATIN_TERMS);
}

/**
 * Typo-tolerant fallback, only reached when the strict search above found
 * nothing. Uses the pg_trgm similarity index on `search_terms.term`.
 *
 * `types` keeps the fallback inside the script that was actually typed —
 * trigram-matching ねこ against romaji terms, or an English query against
 * kanji, only produces coincidences.
 *
 * Now that romaji is matched exactly, this is also what catches a partial
 * reading: `tabe` no longer prefix-matches `taberu`, but is similar enough to
 * arrive here.
 */
async function fuzzy(
  term: string,
  types: readonly string[],
): Promise<SearchResult[]> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

  // `types` has to stay a plain array: it is part of the `use cache` key, so it
  // must be serializable. Drizzle spreads an interpolated array into one
  // placeholder per element rather than binding it as a Postgres array, so
  // build the IN list explicitly.
  const typeList = sql.join(
    types.map((t) => sql`${t}`),
    sql`, `,
  );

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
      AND st.term_type IN (${typeList})
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
