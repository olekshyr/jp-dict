import { Suspense } from "react";
import Link from "next/link";
import { BookmarkIcon, SearchXIcon } from "lucide-react";

import { getMyWordCounts, getMyWords } from "@/lib/user-words/queries";
import {
  ALL,
  isListFilter,
  LIST_FILTERS,
  type FilterValue,
} from "@/lib/srs/grades";
import { pageCount, paginationHref, parsePagination } from "@/lib/pagination";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { ListFilterTabs } from "./list-filter-tabs";
import { ListRow } from "./list-row";
import {
  LIST_SEARCH_LABEL,
  LIST_SEARCH_PLACEHOLDER,
  ListSearchBox,
} from "./list-search-box";
import { ListSession } from "./list-session";
import { RowNote } from "./row-note";
import { PaginationBar } from "../pagination-bar";
import { PendingContent } from "../pending-content";
import { SaveButton } from "../save-button";
import { SearchField } from "../search-field";
import { StatusButton } from "../status-button";
import { WordItem } from "../word-item";

type ListPageParams = {
  filter?: string;
  q?: string;
  page?: string;
  perPage?: string;
};

/**
 * Validates at dev and build time that the boundaries here still produce an
 * instant shell — a misplaced one otherwise silently makes navigation block on
 * the server instead of failing loudly, which is exactly how the filter tabs
 * came to have no loading state at all.
 *
 * `runtime` rather than `static` because this route reads `?filter`, `?q`,
 * `?page` and `?perPage`, so validation needs concrete samples. Every param the
 * route reads has to appear in every sample, `null` where it should be absent.
 */
export const unstable_instant = {
  prefetch: "runtime",
  samples: [
    { searchParams: { filter: null, q: null, page: null, perPage: null } },
    { searchParams: { filter: "mature", q: null, page: null, perPage: null } },
    { searchParams: { filter: null, q: "ねこ", page: null, perPage: null } },
    { searchParams: { filter: "all", q: "cat", page: "2", perPage: "50" } },
  ],
};

/*
 * "all" is the default now that every bucket is a real place a word can be —
 * under the old todo/learned split, landing on "learned" would have shown a
 * graveyard.
 */
function parseFilter(raw?: string): FilterValue {
  return raw && isListFilter(raw) ? raw : ALL;
}

function ListSkeleton() {
  return (
    <ItemGroup>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-md" />
      ))}
    </ItemGroup>
  );
}

async function WordList({
  searchParams,
}: Readonly<{
  searchParams: Promise<ListPageParams>;
}>) {
  const { filter: rawFilter, q = "", ...rest } = await searchParams;
  const filter = parseFilter(rawFilter);
  const query = q.trim();
  const { page: requestedPage, perPage, offset } = parsePagination(rest);

  const [requestedWords, counts] = await Promise.all([
    getMyWords(filter, query, perPage, offset),
    getMyWordCounts(query),
  ]);

  /*
   * Unlike the dictionary, this list shrinks underneath the user: unsaving the
   * last word on the last page leaves them pointing past the end. Clamp to the
   * final page and re-fetch — the counts are already here, and the extra query
   * only runs in that one case rather than on every load.
   */
  const total =
    filter === ALL
      ? LIST_FILTERS.reduce((sum, key) => sum + counts[key], 0)
      : counts[filter];
  const page = Math.min(requestedPage, pageCount(total, perPage));
  const words =
    page === requestedPage
      ? requestedWords
      : await getMyWords(filter, query, perPage, (page - 1) * perPage);

  return (
    // Keyed on the query that produced `counts`, so navigating to another
    // filter or page remounts the session and stale deltas cannot survive.
    <ListSession key={`${filter}:${query}:${page}:${perPage}`} counts={counts}>
      <ListFilterTabs filter={filter} perPage={perPage} query={query} />

      {words.length === 0 ? (
        query ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon />
              </EmptyMedia>
              <EmptyTitle>No saved words match “{query}”</EmptyTitle>
              <EmptyDescription>
                <Link href={paginationHref("/list", { filter, perPage })}>
                  Clear the search
                </Link>{" "}
                to see the whole list, or{" "}
                <Link href={paginationHref("/search", { q: query })}>
                  look it up in the dictionary
                </Link>
                .
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookmarkIcon />
              </EmptyMedia>
              <EmptyTitle>Nothing here yet</EmptyTitle>
              <EmptyDescription>
                <Link href="/search">Search for a word</Link> and save it to
                start building your list.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        // The tab strip stays outside this: it has to remain interactive so a
        // second filter click isn't blocked by the first one still loading.
        <PendingContent>
          <ItemGroup>
            {words.map((word) => (
              <ListRow
                key={word.entryId}
                filter={filter}
                status={word.status}
                bucket={word.bucket}
              >
                <WordItem
                  entryId={word.entryId}
                  headword={word.headword}
                  reading={word.reading}
                  romaji={word.romaji}
                  glossSummary={word.glossSummary}
                  footer={
                    <RowNote entryId={word.entryId} note={word.note} />
                  }
                >
                  <StatusButton entryId={word.entryId} status={word.status} />
                  <SaveButton entryId={word.entryId} saved />
                </WordItem>
              </ListRow>
            ))}
          </ItemGroup>

          <PaginationBar
            pathname="/list"
            params={{ filter, q: query }}
            page={page}
            perPage={perPage}
            total={total}
          />
        </PendingContent>
      )}
    </ListSession>
  );
}

export default function ListPage({
  searchParams,
}: {
  searchParams: Promise<ListPageParams>;
}) {
  return (
    <div>
      {/* Static shell: the heading paints immediately, the list streams. */}
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">My list</h1>

      <Suspense
        fallback={
          <SearchField
            disabled
            placeholder={LIST_SEARCH_PLACEHOLDER}
            label={LIST_SEARCH_LABEL}
          />
        }
      >
        <ListSearchBox />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <WordList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
