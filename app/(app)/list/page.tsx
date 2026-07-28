import { Suspense } from "react";
import Link from "next/link";

import {
  getMyWordCounts,
  getMyWords,
  type WordStatus,
} from "@/lib/user-words/queries";
import { SaveButton, StatusButton } from "../save-button";

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
    <ul className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-20 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900"
        />
      ))}
    </ul>
  );
}

async function WordList({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter = parseFilter(rawFilter);

  const [words, counts] = await Promise.all([
    getMyWords(filter === "all" ? undefined : filter),
    getMyWordCounts(),
  ]);

  return (
    <>
      <div className="mb-6 flex gap-1">
        {FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? counts.todo + counts.learned
              : counts[f.value as WordStatus];
          const active = f.value === filter;
          return (
            <Link
              key={f.value}
              href={`/list?filter=${f.value}`}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{count}</span>
            </Link>
          );
        })}
      </div>

      {words.length === 0 ? (
        <p className="text-zinc-500">
          Nothing here yet.{" "}
          <Link href="/search" className="underline underline-offset-4">
            Search for a word
          </Link>{" "}
          and save it to start building your list.
        </p>
      ) : (
        <ul className="space-y-2">
          {words.map((word) => (
            <li
              key={word.entryId}
              className="flex items-start gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <Link
                href={`/entry/${word.entryId}`}
                className="min-w-0 flex-1 transition-opacity hover:opacity-70"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-2xl">{word.headword}</span>
                  {word.reading !== word.headword && (
                    <span className="text-zinc-500">{word.reading}</span>
                  )}
                  <span className="font-mono text-xs text-zinc-400">
                    {word.romaji}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {word.glossSummary}
                </p>
              </Link>
              <div className="flex shrink-0 flex-col gap-1.5">
                <StatusButton entryId={word.entryId} status={word.status} />
                <SaveButton entryId={word.entryId} saved />
              </div>
            </li>
          ))}
        </ul>
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
