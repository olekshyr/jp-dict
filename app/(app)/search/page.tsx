import { Suspense } from "react";
import { SearchIcon, SearchXIcon } from "lucide-react";

import { searchEntries } from "@/lib/dictionary/search";
import { getSavedEntryIds } from "@/lib/user-words/queries";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveButton } from "../save-button";
import { SearchField } from "../search-field";
import { SearchPendingProvider } from "../search-pending";
import { WordItem } from "../word-item";
import { PendingResults } from "./pending-results";
import { SearchBox } from "./search-box";

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
    <ItemGroup>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-20 rounded-md" />
      ))}
    </ItemGroup>
  );
}

async function Results({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ q?: string }>;
}>) {
  const { q = "" } = await searchParams;

  if (q.trim().length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>Look something up</EmptyTitle>
          <EmptyDescription>
            Search by kanji (猫), kana (ねこ), romaji (neko) or English (cat).
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No matches for “{q}”</EmptyTitle>
          <EmptyDescription>
            Try a different spelling, or search the English meaning instead.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        {results.length === 50 ? "Top 50 matches" : `${results.length} matches`}{" "}
        for <span className="font-medium">{q}</span>
      </p>
      <ItemGroup>
        {results.map((result) => (
          <WordItem
            key={result.entryId}
            entryId={result.entryId}
            headword={result.headword}
            reading={result.reading}
            romaji={result.romaji}
            glossSummary={result.glossSummary}
            isCommon={result.isCommon}
          >
            <SaveButton
              entryId={result.entryId}
              saved={savedIds.has(result.entryId)}
            />
          </WordItem>
        ))}
      </ItemGroup>
    </>
  );
}

export default function SearchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ q?: string }>;
}>) {
  return (
    <div>
      <h1 className="sr-only">Search the dictionary</h1>

      {/*
        Two boundaries, deliberately separate. The box only needs the query
        string; the results need a database round-trip. Splitting them lets the
        input become interactive without waiting on the query.

        Both sit inside the provider, including the box's inert fallback: it
        holds the transition that submitting the form runs in, which is what
        lets the field spin and these results dim from a single pending flag.
        It reads nothing from the request, so the shell still prerenders.
      */}
      <SearchPendingProvider>
        <Suspense
          // The fallback is the same field, inert: identical markup means the
          // box is present in the prerendered HTML and does not shift when the
          // seeded one takes over.
          fallback={<SearchField disabled />}
        >
          <SearchBox />
        </Suspense>

        {/*
          Wrapping the boundary rather than <Results>: on a repeat query the
          boundary never falls back — it is already mounted, so React holds the
          old rows on screen — and this is what marks them as stale meanwhile.
        */}
        <PendingResults>
          <Suspense fallback={<ResultsSkeleton />}>
            <Results searchParams={searchParams} />
          </Suspense>
        </PendingResults>
      </SearchPendingProvider>
    </div>
  );
}
