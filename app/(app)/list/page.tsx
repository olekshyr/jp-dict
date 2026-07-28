import { Suspense } from "react";
import Link from "next/link";
import { BookmarkIcon } from "lucide-react";

import {
  getMyWordCounts,
  getMyWords,
  type WordStatus,
} from "@/lib/user-words/queries";
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
import { SaveButton } from "../save-button";
import { StatusButton } from "../status-button";
import { WordItem } from "../word-item";

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
  searchParams: Promise<{ filter?: string }>;
}>) {
  const { filter: rawFilter } = await searchParams;
  const filter = parseFilter(rawFilter);

  const [words, counts] = await Promise.all([
    getMyWords(filter === "all" ? undefined : filter),
    getMyWordCounts(),
  ]);

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
                render={<Link href={`/list?filter=${f.value}`} />}
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
      )}
    </>
  );
}

export default function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
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
