import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import {
  entries,
  furigana,
  glosses,
  kanjiForms,
  readings,
  senses,
  type RubySegment,
} from "@/lib/db/schema";

export type EntrySense = {
  pos: string[];
  field: string[];
  misc: string[];
  dialect: string[];
  info: string | null;
  glosses: Array<{ text: string; type: string | null }>;
};

export type EntryDetail = {
  id: number;
  isCommon: boolean;
  kanji: Array<{ text: string; isCommon: boolean }>;
  readings: Array<{ kana: string; romaji: string; isCommon: boolean }>;
  senses: EntrySense[];
  /** Aligned ruby for the headword + primary reading, when the dataset has it. */
  ruby: RubySegment[] | null;
};

/**
 * Loads one dictionary entry in full.
 *
 * `cacheLife('max')` because JMdict does not change between imports; the
 * `dictionary` tag invalidates every cached entry when it does.
 */
export async function getEntry(id: number): Promise<EntryDetail | null> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

  const [entry] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);

  if (!entry) return null;

  const [kanjiRows, readingRows, senseRows] = await Promise.all([
    db
      .select()
      .from(kanjiForms)
      .where(eq(kanjiForms.entryId, id))
      .orderBy(asc(kanjiForms.ord)),
    db
      .select()
      .from(readings)
      .where(eq(readings.entryId, id))
      .orderBy(asc(readings.ord)),
    db
      .select()
      .from(senses)
      .where(eq(senses.entryId, id))
      .orderBy(asc(senses.ord)),
  ]);

  const glossRows = senseRows.length
    ? await db
        .select()
        .from(glosses)
        .where(
          inArray(
            glosses.senseId,
            senseRows.map((s) => s.id),
          ),
        )
        .orderBy(asc(glosses.senseId), asc(glosses.ord))
    : [];

  const glossesBySense = new Map<number, EntrySense["glosses"]>();
  for (const g of glossRows) {
    const list = glossesBySense.get(g.senseId) ?? [];
    list.push({ text: g.text, type: g.type });
    glossesBySense.set(g.senseId, list);
  }

  const headword = kanjiRows[0]?.text;
  const primaryReading = readingRows[0]?.kana;
  let ruby: RubySegment[] | null = null;

  // Only kanji-bearing entries have an alignment; kana-only words need none.
  if (headword && primaryReading) {
    const [match] = await db
      .select({ ruby: furigana.ruby })
      .from(furigana)
      .where(
        and(
          eq(furigana.kanjiText, headword),
          eq(furigana.readingKana, primaryReading),
        ),
      )
      .limit(1);
    ruby = match?.ruby ?? null;
  }

  return {
    id: entry.id,
    isCommon: entry.isCommon,
    kanji: kanjiRows.map((k) => ({ text: k.text, isCommon: k.isCommon })),
    readings: readingRows.map((r) => ({
      kana: r.kana,
      romaji: r.romaji,
      isCommon: r.isCommon,
    })),
    senses: senseRows.map((s) => ({
      pos: s.pos ?? [],
      field: s.field ?? [],
      misc: s.misc ?? [],
      dialect: s.dialect ?? [],
      info: s.info,
      glosses: glossesBySense.get(s.id) ?? [],
    })),
    ruby,
  };
}

/**
 * The most common entries, used by `generateStaticParams` so the words people
 * actually look up are fully prerendered at build time.
 */
export async function getCommonEntryIds(limit = 2000): Promise<number[]> {
  "use cache";
  cacheLife("max");
  cacheTag("dictionary");

  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.isCommon, true), isNotNull(entries.freqRank)))
    .orderBy(asc(entries.freqRank), desc(entries.id))
    .limit(limit);

  return rows.map((r) => r.id);
}
