import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getCommonEntryIds, getEntry } from "@/lib/dictionary/entry";
import { describeTag } from "@/lib/dictionary/tags";
import { RubyWord } from "./ruby-word";

/**
 * `runtime` rather than `static`: this route reads a dynamic `id`, so instant
 * validation needs a concrete sample to render against. 1467640 is 猫 — a
 * kanji-bearing entry with furigana and several senses, so it exercises the
 * full body rather than a degenerate one.
 */
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { id: "1467640" } }],
};

/**
 * Prerenders the most common entries in full. Everything else is still served
 * from the `use cache` layer, just resolved on first request rather than at
 * build time.
 */
export async function generateStaticParams() {
  const ids = await getCommonEntryIds(2000);
  return ids.map((id) => ({ id: String(id) }));
}

function TagList({ tags, tone }: { tags: string[]; tone: string }) {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          title={describeTag(tag)}
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}
        >
          {describeTag(tag)}
        </span>
      ))}
    </>
  );
}

async function EntryBody({ id }: { id: string }) {
  "use cache";

  const entryId = Number(id);
  if (!Number.isInteger(entryId)) notFound();

  const entry = await getEntry(entryId);
  if (!entry) notFound();

  const headword = entry.kanji[0]?.text ?? entry.readings[0]?.kana ?? "";
  const primaryReading = entry.readings[0];

  return (
    <article>
      <header className="mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div className="flex flex-wrap items-baseline gap-4">
          <RubyWord
            segments={entry.ruby}
            fallback={headword}
            className="text-5xl leading-tight"
          />
          {entry.isCommon && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              common
            </span>
          )}
        </div>

        {primaryReading && (
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            {primaryReading.kana}
            <span className="ml-3 font-mono text-sm text-zinc-400">
              {primaryReading.romaji}
            </span>
          </p>
        )}

        {(entry.kanji.length > 1 || entry.readings.length > 1) && (
          <dl className="mt-4 space-y-1 text-sm text-zinc-500">
            {entry.kanji.length > 1 && (
              <div className="flex gap-2">
                <dt className="shrink-0">Other forms</dt>
                <dd>{entry.kanji.slice(1).map((k) => k.text).join("、")}</dd>
              </div>
            )}
            {entry.readings.length > 1 && (
              <div className="flex gap-2">
                <dt className="shrink-0">Other readings</dt>
                <dd>
                  {entry.readings.slice(1).map((r) => r.kana).join("、")}
                </dd>
              </div>
            )}
          </dl>
        )}
      </header>

      <ol className="space-y-6">
        {entry.senses.map((sense, i) => (
          <li key={i} className="flex gap-4">
            <span className="mt-0.5 w-6 shrink-0 text-right text-sm text-zinc-400">
              {i + 1}.
            </span>
            <div className="flex-1">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <TagList
                  tags={sense.pos}
                  tone="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                />
                <TagList
                  tags={sense.misc}
                  tone="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                />
                <TagList
                  tags={sense.field}
                  tone="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
                />
                <TagList
                  tags={sense.dialect}
                  tone="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                />
              </div>
              <p className="text-lg">
                {sense.glosses.map((g) => g.text).join("; ")}
              </p>
              {sense.info && (
                <p className="mt-1 text-sm italic text-zinc-500">{sense.info}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

export default function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
      }
    >
      {/*
        `params` is resolved inline rather than awaited in this component.
        Awaiting it here would suspend the page itself, pulling the whole route
        out of the static shell; resolving it inside the boundary keeps the
        cached body as the only thing that has to wait, and hands it a plain
        string so it stays part of the `use cache` key.
      */}
      {params.then(({ id }) => (
        <EntryBody id={id} />
      ))}
    </Suspense>
  );
}
