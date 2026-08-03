import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import {
  clampQuery,
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

/** One page of results, plus how many matches there are in total. */
export type SearchPage = {
  results: SearchResult[];
  total: number;
};

/** `search_terms.term_type` values each script may match against. */
const JAPANESE_TERMS = ["kanji", "kana"] as const;
const LATIN_TERMS = ["romaji"] as const;

const EMPTY: SearchPage = { results: [], total: 0 };

/*
 * Every query below ends its ORDER BY with `es.entry_id ASC`. The ranking keys
 * are full of ties — dozens of entries share a weight and have no freq_rank —
 * and Postgres is free to break those ties differently from one execution to
 * the next. Under a single `LIMIT 50` that was invisible; under LIMIT/OFFSET it
 * means consecutive pages can repeat some entries and skip others. The entry id
 * makes the sort a total order, so the pages partition the match set exactly.
 */

type SearchRow = {
  entry_id: string | number;
  headword: string;
  reading: string;
  romaji: string;
  gloss_summary: string;
  is_common: boolean;
  total: string | number;
};

/**
 * Every query below carries its own match count in `count(*) OVER ()`, so a
 * page and its total arrive in one round-trip rather than needing a separate
 * COUNT. An empty result set carries no count at all, which reads as zero —
 * meaning either nothing matched or the offset is past the end. Telling those
 * two apart is `pageWithFallback`'s job.
 */
function toPage(rows: SearchRow[]): SearchPage {
  return {
    results: rows.map((r) => ({
      entryId: Number(r.entry_id),
      headword: r.headword,
      reading: r.reading,
      romaji: r.romaji,
      glossSummary: r.gloss_summary,
      isCommon: r.is_common,
    })),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  };
}

/**
 * Searches the dictionary, one page at a time.
 *
 * Cached with `cacheLife('max')` because JMdict is immutable between imports —
 * a repeated query is free, and popular queries land in the static shell. The
 * `dictionary` tag lets a re-import invalidate everything at once. `page` and
 * `perPage` are plain numbers and so key the cache alongside the query: each
 * page of each query becomes its own small, permanently valid entry.
 *
 * The total is a window function over the whole match set, so a very broad
 * query does more work here than the old fixed `LIMIT 50` did. That cost is
 * paid once per unique query and then served from cache, which is why no
 * artificial ceiling is imposed on how deep the results go.
 *
 * Note this deliberately knows nothing about the current user: results are
 * identical for everyone, which is what makes them shareable and cacheable.
 * "Is this word already in my list?" is fetched separately.
 *
 * `page` and `perPage` are expected to have been through `parsePagination`
 * already — it is what bounds them, and everything below turns them straight
 * into LIMIT/OFFSET.
 */
export async function searchEntries(
  rawQuery: string,
  page: number,
  perPage: number,
): Promise<SearchPage> {
  /*
   * Deliberately not `use cache` itself. A cached function's arguments *are* its
   * cache key, so caching here would key on the raw query — unbounded user input
   * against a cache that never expires. Clamping first and caching below bounds
   * the key space by MAX_QUERY_LENGTH instead, and costs nothing: this wrapper
   * is pure string work with no round-trip of its own.
   */
  return searchClamped(clampQuery(rawQuery), page, perPage);
}

async function searchClamped(
  rawQuery: string,
  page: number,
  perPage: number,
): Promise<SearchPage> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

  const script = detectScript(rawQuery);
  if (script === "empty") return EMPTY;

  const offset = (page - 1) * perPage;

  if (script === "japanese") {
    const term = normalizeJapanese(rawQuery);
    return pageWithFallback(
      (limit, from) => japaneseMatches(term, limit, from),
      (limit, from) => fuzzyMatches(term, JAPANESE_TERMS, limit, from),
      perPage,
      offset,
    );
  }

  /*
   * Latin input is ambiguous — it could be romaji or an English gloss, so try
   * both and rank romaji hits above gloss hits.
   */
  const romaji = normalizeRomaji(rawQuery);
  const english = rawQuery.trim();

  return pageWithFallback(
    (limit, from) => latinMatches(romaji, english, limit, from),
    (limit, from) => fuzzyMatches(romaji, LATIN_TERMS, limit, from),
    perPage,
    offset,
  );
}

/**
 * Runs the strict search for one page, falling back to the typo-tolerant one
 * when the query matched nothing at all.
 *
 * The subtlety pagination introduces: an empty page no longer means "no
 * matches". It could equally be page 3 of a 12-result set, or any page beyond
 * the first of a query that only fuzzy can answer. So when a page comes back
 * empty at a non-zero offset, this probes the strict search for a single row
 * to find out which. The probe is itself cached and page-independent, so
 * paging through fuzzy results costs one extra round-trip in total, not one
 * per page.
 */
async function pageWithFallback(
  strict: (limit: number, offset: number) => Promise<SearchPage>,
  fuzzy: (limit: number, offset: number) => Promise<SearchPage>,
  perPage: number,
  offset: number,
): Promise<SearchPage> {
  const result = await strict(perPage, offset);
  if (result.total > 0) return result;

  if (offset === 0) return fuzzy(perPage, 0);

  const probe = await strict(1, 0);
  // The strict search does have matches, so this is simply a page past the end
  // of them. Report the real total; the caller renders an out-of-range state.
  if (probe.total > 0) return { results: [], total: probe.total };

  return fuzzy(perPage, offset);
}

/**
 * Prefix match against kanji and kana surface forms. Postgres has no Japanese
 * tokenizer, so this is a `text_pattern_ops` btree range scan rather than
 * full-text search — which is also how dictionary lookup actually behaves.
 */
async function japaneseMatches(
  term: string,
  limit: number,
  offset: number,
): Promise<SearchPage> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

  const prefix = escapeLikePrefix(term);

  const rows = await db.execute<SearchRow>(sql`
    SELECT
      es.entry_id,
      es.headword,
      es.reading,
      es.romaji,
      es.gloss_summary,
      es.is_common,
      -- Evaluated after GROUP BY, so this counts matching entries, not rows.
      count(*) OVER () AS total
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
      es.freq_rank ASC NULLS LAST,
      es.entry_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return toPage(rows.rows as SearchRow[]);
}

/**
 * Romaji and English gloss hits, merged.
 *
 * Both arms match strictly: romaji by equality, English by whole word against
 * the unstemmed `simple` tsvector. A prefix match here would mean the English
 * word "man" pulling in まんが and まんなか ahead of anything that means "man",
 * which is noise rather than a longer list.
 */
async function latinMatches(
  romaji: string,
  english: string,
  limit: number,
  offset: number,
): Promise<SearchPage> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

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
      es.is_common,
      count(*) OVER () AS total
    FROM merged m
    JOIN entry_search es ON es.entry_id = m.entry_id
    ORDER BY
      m.source ASC,
      es.is_common DESC,
      es.freq_rank ASC NULLS LAST,
      es.entry_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return toPage(rows.rows as SearchRow[]);
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
async function fuzzyMatches(
  term: string,
  types: readonly string[],
  limit: number,
  offset: number,
): Promise<SearchPage> {
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
      es.is_common,
      count(*) OVER () AS total
    FROM search_terms st
    JOIN entry_search es ON es.entry_id = st.entry_id
    WHERE st.term % ${term}
      AND st.term_type IN (${typeList})
    GROUP BY es.entry_id, es.headword, es.reading, es.romaji,
             es.gloss_summary, es.is_common, es.freq_rank
    ORDER BY
      max(similarity(st.term, ${term})) DESC,
      es.is_common DESC,
      es.freq_rank ASC NULLS LAST,
      es.entry_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return toPage(rows.rows as SearchRow[]);
}
