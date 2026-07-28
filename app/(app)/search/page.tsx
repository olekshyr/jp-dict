import { Suspense } from "react";
import Link from "next/link";

import { searchEntries } from "@/lib/dictionary/search";
import { getSavedEntryIds } from "@/lib/user-words/queries";
import { SaveButton } from "../save-button";
import { SearchBox, SearchBoxFallback } from "./search-box";

/**
 * Validates at dev and build time that the Suspense boundaries here still
 * produce an instant shell — a misplaced one otherwise silently makes
 * navigation block on the server instead of failing loudly.
 *
 * `runtime` rather than `static` because this route reads `?q`, so validation
 * needs concrete samples: the empty state that gets prefetched, and a typical
 * query.
 */
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ searchParams: { q: null } }, { searchParams: { q: "ねこ" } }],
};

function ResultsSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <li
          key={i}
          className="h-20 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900"
        />
      ))}
    </ul>
  );
}

async function Results({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  if (q.trim().length === 0) {
    return (
      <p className="text-zinc-500">
        Search by kanji (猫), kana (ねこ), romaji (neko) or English (cat).
      </p>
    );
  }

  /*
   * Two queries, deliberately. `searchEntries` is `use cache` — shared across
   * every user and effectively free on a repeat query. Which of those results
   * the *current* user has saved is a separate, tiny, uncached lookup, so
   * personalisation never makes the expensive query uncacheable.
   */
  const results = await searchEntries(q);
  const savedIds = await getSavedEntryIds(results.map((r) => r.entryId));

  if (results.length === 0) {
    return (
      <p className="text-zinc-500">
        No matches for <span className="font-medium">{q}</span>.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-zinc-500">
        {results.length === 50 ? "Top 50 matches" : `${results.length} matches`}{" "}
        for <span className="font-medium">{q}</span>
      </p>
      <ul className="space-y-2">
        {results.map((result) => (
          <li
            key={result.entryId}
            className="flex items-start gap-3 rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <Link href={`/entry/${result.entryId}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl">{result.headword}</span>
                {result.reading !== result.headword && (
                  <span className="text-zinc-500">{result.reading}</span>
                )}
                <span className="font-mono text-xs text-zinc-400">
                  {result.romaji}
                </span>
                {result.isCommon && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    common
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                {result.glossSummary}
              </p>
            </Link>
            <SaveButton
              entryId={result.entryId}
              saved={savedIds.has(result.entryId)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <div>
      <h1 className="sr-only">Search the dictionary</h1>

      {/*
        Two boundaries, deliberately separate. The box only needs the query
        string; the results need a database round-trip. Splitting them lets the
        input become interactive without waiting on the query.
      */}
      <Suspense fallback={<SearchBoxFallback />}>
        <SearchBox />
      </Suspense>

      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
