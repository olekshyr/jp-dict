import { Suspense } from "react";
import Link from "next/link";
import { BookmarkIcon } from "lucide-react";

import { getMyWordCounts, getMyWords } from "@/lib/user-words/queries";
import { isListFilter, LIST_FILTERS, type ListFilter } from "@/lib/srs/grades";
import { pageCount, parsePagination } from "@/lib/pagination";
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
import { ListSession } from "./list-session";
import { RowNote } from "./row-note";
import { PaginationBar } from "../pagination-bar";
import { PendingContent } from "../pending-content";
import { SaveButton } from "../save-button";
import { StatusButton } from "../status-button";
import { WordItem } from "../word-item";

type ListPageParams = { filter?: string; page?: string; perPage?: string };

/**
 * Validates at dev and build time that the boundaries here still produce an
 * instant shell — a misplaced one otherwise silently makes navigation block on
 * the server instead of failing loudly, which is exactly how the filter tabs
 * came to have no loading state at all.
 *
 * `runtime` rather than `static` because this route reads `?filter`, `?page`
 * and `?perPage`, so validation needs concrete samples. Every param the route
 * reads has to appear in every sample, `null` where it should be absent.
 */
export const unstable_instant = {
  prefetch: "runtime",
  samples: [
    { searchParams: { filter: null, page: null, perPage: null } },
    { searchParams: { filter: "mature", page: null, perPage: null } },
    { searchParams: { filter: "all", page: "2", perPage: "50" } },
  ],
};

/*
 * "all" is the default now that every bucket is a real place a word can be —
 * under the old todo/learned split, landing on "learned" would have shown a
 * graveyard.
 */
function parseFilter(raw?: string): ListFilter | "all" {
  return raw && isListFilter(raw) ? raw : "all";
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
  const { filter: rawFilter, ...rest } = await searchParams;
  const filter = parseFilter(rawFilter);
  const { page: requestedPage, perPage, offset } = parsePagination(rest);

  const [requestedWords, counts] = await Promise.all([
    getMyWords(filter, perPage, offset),
    getMyWordCounts(),
  ]);

  /*
   * Unlike the dictionary, this list shrinks underneath the user: unsaving the
   * last word on the last page leaves them pointing past the end. Clamp to the
   * final page and re-fetch — the counts are already here, and the extra query
   * only runs in that one case rather than on every load.
   */
  const total =
    filter === "all"
      ? LIST_FILTERS.reduce((sum, key) => sum + counts[key], 0)
      : counts[filter];
  const page = Math.min(requestedPage, pageCount(total, perPage));
  const words =
    page === requestedPage
      ? requestedWords
      : await getMyWords(filter, perPage, (page - 1) * perPage);

  return (
    // Keyed on the query that produced `counts`, so navigating to another
    // filter or page remounts the session and stale deltas cannot survive.
    <ListSession key={`${filter}:${page}:${perPage}`} counts={counts}>
      <ListFilterTabs filter={filter} perPage={perPage} />

      {words.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookmarkIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>
              <Link href="/search">Search for a word</Link> and save it to start
              building your list.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
            params={{ filter }}
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
      <Suspense fallback={<ListSkeleton />}>
        <WordList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
