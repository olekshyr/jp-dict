import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SearchIcon, SearchXIcon } from "lucide-react";

import { parsePagination, paginationHref } from "@/lib/pagination";
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
import { PendingContent } from "../pending-content";
import { SearchField } from "../search-field";
import { WordItem } from "../word-item";
import { PaginationBar } from "../pagination-bar";
import { SearchBox } from "./search-box";

type SearchPageParams = { q?: string; page?: string; perPage?: string };

/**
 * Validates at dev and build time that the Suspense boundaries here still
 * produce an instant shell — a misplaced one otherwise silently makes
 * navigation block on the server instead of failing loudly.
 *
 * `runtime` rather than `static` because this route reads `?q`, so validation
 * needs concrete samples: the empty state that gets prefetched, a typical
 * query, and a paginated one — every distinct shape of entry point.
 */
export const unstable_instant = {
  prefetch: "runtime",
  // Every param the route reads has to appear in every sample, `null` where it
  // should be absent — otherwise validation can't tell "not paginated" from
  // "forgot to declare it".
  samples: [
    { searchParams: { q: null, page: null, perPage: null } },
    { searchParams: { q: "ねこ", page: null, perPage: null } },
    { searchParams: { q: "ねこ", page: "2", perPage: "50" } },
  ],
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
  searchParams: Promise<SearchPageParams>;
}>) {
  /*
   * Results renders concurrently with the layout's AuthGate, so without this
   * an anonymous request reaches Neon before the redirect lands. Serialised
   * here rather than in searchEntries: the data layer stays user-blind and
   * cacheable; the guard rides the component that is already request-time.
   */
  await auth.protect();

  const { q = "", ...rest } = await searchParams;
  const { page, perPage, offset } = parsePagination(rest);

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
  const { results, total } = await searchEntries(q, page, perPage);
  const savedIds = await getSavedEntryIds(results.map((r) => r.entryId));

  if (total === 0) {
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

  /*
   * There are matches, but none on this page — only reachable by editing the
   * URL, since the dictionary never shrinks underneath a link.
   */
  if (results.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing on page {page}</EmptyTitle>
          <EmptyDescription>
            “{q}” has {total} matches.{" "}
            <Link href={paginationHref("/search", { q, perPage })}>
              Back to the first page
            </Link>
            .
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Showing {offset + 1}–{offset + results.length} of {total} matches for{" "}
        <span className="font-medium">{q}</span>
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

      <PaginationBar
        pathname="/search"
        params={{ q }}
        page={page}
        perPage={perPage}
        total={total}
      />
    </>
  );
}

export default function SearchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchPageParams>;
}>) {
  return (
    <div>
      <h1 className="sr-only">Search the dictionary</h1>

      {/*
        Two boundaries, deliberately separate. The box only needs the query
        string; the results need a database round-trip. Splitting them lets the
        input become interactive without waiting on the query.

        The pending flag both of them read comes from the (app) layout now, so
        the field's spinner and this dimming also cover the pagination links
        below, not just a form submit.
      */}
      <Suspense
        // The fallback is the same field, inert: identical markup means the
        // box is present in the prerendered HTML and does not shift when the
        // seeded one takes over.
        fallback={<SearchField disabled />}
      >
        <SearchBox />
      </Suspense>

      <PendingContent>
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </PendingContent>
    </div>
  );
}
