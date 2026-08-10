import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { entrySearch, furigana, users, userWords } from "@/lib/db/schema";
import type { RubySegment } from "@/lib/db/schema";
import { requireUserId } from "./auth";

export type WordStatus = "todo" | "learned";

/** A row in the user's list. A DTO, not a table row — no SRS internals leak. */
export type SavedWord = {
  entryId: number;
  headword: string;
  reading: string;
  romaji: string;
  glossSummary: string;
  status: WordStatus;
  note: string | null;
};

/** One flashcard. Only what the client component actually renders. */
export type Card = {
  entryId: number;
  headword: string;
  reading: string;
  romaji: string;
  glosses: string;
  ruby: RubySegment[] | null;
};

export type FrontMode = "kanji" | "furigana" | "romaji" | "english";

const FRONT_MODES: readonly FrontMode[] = [
  "kanji",
  "furigana",
  "romaji",
  "english",
];

export function isFrontMode(value: string): value is FrontMode {
  return (FRONT_MODES as readonly string[]).includes(value);
}

/**
 * One page of the signed-in user's saved words, newest first.
 *
 * No count comes back with it: the caller already has `getMyWordCounts()` for
 * the filter tabs, and those counts are the same totals pagination needs.
 *
 * Not cached. `(user_id, status, added_at DESC)` drives the scan and serves the
 * offset too, and `use cache` is in-memory per instance on serverless, so it
 * would add invalidation complexity for a near-zero hit rate.
 */
export async function getMyWords(
  status: WordStatus | undefined,
  limit: number,
  offset: number,
): Promise<SavedWord[]> {
  const userId = await requireUserId();

  const rows = await db
    .select({
      entryId: userWords.entryId,
      status: userWords.status,
      note: userWords.note,
      headword: entrySearch.headword,
      reading: entrySearch.reading,
      romaji: entrySearch.romaji,
      glossSummary: entrySearch.glossSummary,
    })
    .from(userWords)
    .innerJoin(entrySearch, eq(entrySearch.entryId, userWords.entryId))
    .where(
      status
        ? and(eq(userWords.userId, userId), eq(userWords.status, status))
        : eq(userWords.userId, userId),
    )
    .orderBy(desc(userWords.addedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    entryId: r.entryId,
    headword: r.headword,
    reading: r.reading,
    romaji: r.romaji,
    glossSummary: r.glossSummary,
    status: r.status as WordStatus,
    note: r.note,
  }));
}

/** Counts by status, for the filter tabs. */
export async function getMyWordCounts(): Promise<{
  todo: number;
  learned: number;
}> {
  const userId = await requireUserId();

  const rows = await db
    .select({
      status: userWords.status,
      count: sql<string>`count(*)::text`,
    })
    .from(userWords)
    .where(eq(userWords.userId, userId))
    .groupBy(userWords.status);

  const counts = { todo: 0, learned: 0 };
  for (const row of rows) {
    if (row.status === "todo") counts.todo = Number(row.count);
    if (row.status === "learned") counts.learned = Number(row.count);
  }
  return counts;
}

/**
 * Which of `entryIds` the user has already saved.
 *
 * Kept separate from the dictionary search so the expensive, shared query stays
 * cacheable and only this tiny per-user lookup is request-time.
 */
export async function getSavedEntryIds(
  entryIds: number[],
): Promise<Set<number>> {
  if (entryIds.length === 0) return new Set();
  const userId = await requireUserId();

  const rows = await db
    .select({ entryId: userWords.entryId })
    .from(userWords)
    .where(
      and(eq(userWords.userId, userId), inArray(userWords.entryId, entryIds)),
    );

  return new Set(rows.map((r) => r.entryId));
}

/**
 * The signed-in user's row for one entry, or null if they haven't saved it.
 *
 * Distinct from `getSavedEntryIds`, which answers set membership for a whole
 * page of search results: this one carries the row's own per-user payload, so
 * it is worth a separate call only where that payload is actually rendered.
 * A single `(user_id, entry_id)` unique-index lookup.
 */
export async function getSavedWord(
  entryId: number,
): Promise<{ status: WordStatus; note: string | null } | null> {
  const userId = await requireUserId();

  const [row] = await db
    .select({ status: userWords.status, note: userWords.note })
    .from(userWords)
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)))
    .limit(1);

  if (!row) return null;
  return { status: row.status as WordStatus, note: row.note };
}

/** Unlearned words for a review session, shuffled. */
export async function getReviewCards(limit = 20): Promise<Card[]> {
  const userId = await requireUserId();

  const rows = await db
    .select({
      entryId: userWords.entryId,
      headword: entrySearch.headword,
      reading: entrySearch.reading,
      romaji: entrySearch.romaji,
      glossSummary: entrySearch.glossSummary,
      ruby: furigana.ruby,
    })
    .from(userWords)
    .innerJoin(entrySearch, eq(entrySearch.entryId, userWords.entryId))
    // Left join: kana-only words have no alignment, and must still appear.
    .leftJoin(
      furigana,
      and(
        eq(furigana.kanjiText, entrySearch.headword),
        eq(furigana.readingKana, entrySearch.reading),
      ),
    )
    .where(and(eq(userWords.userId, userId), eq(userWords.status, "todo")))
    .orderBy(sql`random()`)
    .limit(limit);

  return rows.map((r) => ({
    entryId: r.entryId,
    headword: r.headword,
    reading: r.reading,
    romaji: r.romaji,
    glosses: r.glossSummary,
    ruby: r.ruby,
  }));
}

/** The user's preferred flashcard front. Defaults to kanji for new users. */
export async function getFrontMode(): Promise<FrontMode> {
  const userId = await requireUserId();

  const [row] = await db
    .select({ frontMode: users.frontMode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const mode = row?.frontMode ?? "kanji";
  return isFrontMode(mode) ? mode : "kanji";
}
