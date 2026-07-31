import { Suspense } from "react";
import Link from "next/link";
import { BookmarkIcon } from "lucide-react";

import {
  getMyWordCounts,
  getMyWords,
  type WordStatus,
} from "@/lib/user-words/queries";
import {
  pageCount,
  parsePagination,
  paginationHref,
} from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaginationBar } from "../pagination-bar";
import { SaveButton } from "../save-button";
import { StatusButton } from "../status-button";
import { WordItem } from "../word-item";

type ListPageParams = { filter?: string; page?: string; perPage?: string };

const FILTERS: Array<{ value: WordStatus | "all"; label: string }> = [
  { value: "todo", label: "To learn" },
  { value: "learned", label: "Learned" },
  { value: "all", label: "All" },
];

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
    <>
      {/*
        The filter lives in the URL, so each tab is a <Link> and the active tab
        is whatever `?filter=` says. `Tabs` is controlled by that value with no
        onValueChange: navigation, not local state, is what moves the selection.
      */}
      <Tabs value={filter} className="mb-6">
        <TabsList>
          {FILTERS.map((f) => {
            const count =
              f.value === "all"
                ? counts.todo + counts.learned
                : counts[f.value as WordStatus];
            return (
              <TabsTrigger
                key={f.value}
                value={f.value}
                // The tab is an anchor, not a <button>; without this Base UI
                // warns that it is stripping native button semantics.
                nativeButton={false}
                // Carries the chosen page size across tabs but deliberately not
                // the page: a different filter is a different list, so it
                // starts at the top.
                render={
                  <Link
                    href={paginationHref("/list", {
                      filter: f.value,
                      perPage,
                    })}
                  />
                }
              >
                {f.label}
                <Badge variant="secondary">{count}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

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
              <WordItem
                key={word.entryId}
                entryId={word.entryId}
                headword={word.headword}
                reading={word.reading}
                romaji={word.romaji}
                glossSummary={word.glossSummary}
              >
                <StatusButton entryId={word.entryId} status={word.status} />
                <SaveButton entryId={word.entryId} saved />
              </WordItem>
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
    </>
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
