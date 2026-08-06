import { Suspense } from "react";
import Link from "next/link";
import { BookmarkIcon } from "lucide-react";

import {
  getMyWordCounts,
  getMyWords,
  type WordStatus,
} from "@/lib/user-words/queries";
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
import { PaginationBar } from "../pagination-bar";
import { SaveButton } from "../save-button";
import { StatusButton } from "../status-button";
import { WordItem } from "../word-item";

type ListPageParams = { filter?: string; page?: string; perPage?: string };

function parseFilter(raw?: string): WordStatus | "all" {
  return raw === "learned" || raw === "all" ? raw : "todo";
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
  const status = filter === "all" ? undefined : filter;
  const { page: requestedPage, perPage, offset } = parsePagination(rest);

  const [requestedWords, counts] = await Promise.all([
    getMyWords(status, perPage, offset),
    getMyWordCounts(),
  ]);

  /*
   * Unlike the dictionary, this list shrinks underneath the user: unsaving the
   * last word on the last page leaves them pointing past the end. Clamp to the
   * final page and re-fetch — the counts are already here, and the extra query
   * only runs in that one case rather than on every load.
   */
  const total = filter === "all" ? counts.todo + counts.learned : counts[filter];
  const page = Math.min(requestedPage, pageCount(total, perPage));
  const words =
    page === requestedPage
      ? requestedWords
      : await getMyWords(status, perPage, (page - 1) * perPage);

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
        <>
          <ItemGroup>
            {words.map((word) => (
              <ListRow key={word.entryId} filter={filter} status={word.status}>
                <WordItem
                  entryId={word.entryId}
                  headword={word.headword}
                  reading={word.reading}
                  romaji={word.romaji}
                  glossSummary={word.glossSummary}
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
        </>
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
