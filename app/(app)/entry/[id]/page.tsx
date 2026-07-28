import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getCommonEntryIds, getEntry } from "@/lib/dictionary/entry";
import { describeTag } from "@/lib/dictionary/tags";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EntrySaveButton } from "./entry-save-button";
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

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="text-muted-foreground">
          {describeTag(tag)}
        </Badge>
      ))}
    </>
  );
}

/**
 * `saveSlot` is a pass-through slot, not data. Nothing in this body reads it, so
 * it never becomes part of the cache entry — the cached markup keeps a hole that
 * the caller's own <Suspense> fills at request time. That is what lets a
 * per-user control sit inside markup shared by every user.
 */
async function EntryBody({
  id,
  saveSlot,
}: {
  id: string;
  saveSlot: React.ReactNode;
}) {
  "use cache";

  const entryId = Number(id);
  if (!Number.isInteger(entryId)) notFound();

  const entry = await getEntry(entryId);
  if (!entry) notFound();

  const headword = entry.kanji[0]?.text ?? entry.readings[0]?.kana ?? "";
  const primaryReading = entry.readings[0];

  return (
    <article>
      <header className="mb-8 border-b pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-4">
            <RubyWord
              segments={entry.ruby}
              fallback={headword}
              className="text-5xl leading-tight"
            />
            {entry.isCommon && (
              <Badge variant="outline" className="text-muted-foreground">
                common
              </Badge>
            )}
          </div>
          {saveSlot}
        </div>

        {primaryReading && (
          <p className="mt-3 text-lg text-muted-foreground">
            {primaryReading.kana}
            <span className="ml-3 font-mono text-sm text-muted-foreground">
              {primaryReading.romaji}
            </span>
          </p>
        )}

        {(entry.kanji.length > 1 || entry.readings.length > 1) && (
          <dl className="mt-4 space-y-1 text-sm text-muted-foreground">
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
            <span className="mt-0.5 w-6 shrink-0 text-right text-sm text-muted-foreground">
              {i + 1}.
            </span>
            <div className="flex-1">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <TagList tags={sense.pos} />
                <TagList tags={sense.misc} />
                <TagList tags={sense.field} />
                <TagList tags={sense.dialect} />
              </div>
              <p className="text-lg">
                {sense.glosses.map((g) => g.text).join("; ")}
              </p>
              {sense.info && (
                <p className="mt-1 text-sm italic text-muted-foreground">
                  {sense.info}
                </p>
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
    <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
      {/*
        `params` is resolved inline rather than awaited in this component.
        Awaiting it here would suspend the page itself, pulling the whole route
        out of the static shell; resolving it inside the boundary keeps the
        cached body as the only thing that has to wait, and hands it a plain
        string so it stays part of the `use cache` key.
      */}
      {params.then(({ id }) => (
        <EntryBody
          id={id}
          saveSlot={
            /*
              Its own boundary, outside the cached body: reading whether this
              user saved the entry is request-time work, and doing it inline
              would make the shared entry markup unshareable.
            */
            <Suspense
              // Explicit `key` because this element is built here as a prop and
              // only lands among <div>'s children inside the cached body. React
              // marks elements written as literal JSX children as key-checked;
              // one that arrives across the cache boundary misses that pass and
              // gets reported as an unkeyed list child.
              key="save"
              fallback={<Skeleton className="h-9 w-[4.5rem] rounded-md" />}
            >
              <EntrySaveButton id={id} />
            </Suspense>
          }
        />
      ))}
    </Suspense>
  );
}
