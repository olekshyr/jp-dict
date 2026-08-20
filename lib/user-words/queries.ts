import "server-only";

import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { entrySearch, furigana, users, userWords } from "@/lib/db/schema";
import type { RubySegment } from "@/lib/db/schema";
import {
  isListFilter,
  MATURE_DAYS,
  type Bucket,
  type Counts,
  type ListFilter,
  type Previews,
} from "@/lib/srs/grades";
import { bucketOf, preview } from "@/lib/srs/scheduler";
import { requireUserId } from "./auth";

export type WordStatus = "todo" | "learned";

/**
 * Which bucket a row falls in, in SQL.
 *
 * Duplicates `bucketOf` deliberately: filtering and counting have to happen in
 * the database, and reading every row back to bucket it in JavaScript would
 * turn a paged list into a full scan. The two are pinned together by the tests
 * in lib/srs/scheduler.test.ts and by `MATURE_DAYS` being the only threshold.
 */
const bucketSql = sql<ListFilter>`case
    when ${userWords.status} = 'learned' then 'retired'
    when ${userWords.state} = 0 then 'new'
    when ${userWords.state} = 2
      and coalesce(${userWords.intervalDays}, 0) >= ${MATURE_DAYS} then 'mature'
    else 'learning'
  end`;

/** A row in the user's list. A DTO, not a table row — no SRS internals leak. */
export type SavedWord = {
  entryId: number;
  headword: string;
  reading: string;
  romaji: string;
  glossSummary: string;
  status: WordStatus;
  /*
   * Always the schedule-derived bucket, never "retired" — retiring does not
   * touch the schedule, so this is the bucket the word returns to when it comes
   * back. What the row *displays* is `status === "learned" ? "retired" : bucket`.
   */
  bucket: Bucket;
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
  /** What each grade would schedule, already formatted. */
  previews: Previews;
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
  filter: ListFilter | "all",
  limit: number,
  offset: number,
): Promise<SavedWord[]> {
  const userId = await requireUserId();

  const rows = await db
    .select({
      entryId: userWords.entryId,
      status: userWords.status,
      state: userWords.state,
      intervalDays: userWords.intervalDays,
      note: userWords.note,
      headword: entrySearch.headword,
      reading: entrySearch.reading,
      romaji: entrySearch.romaji,
      glossSummary: entrySearch.glossSummary,
    })
    .from(userWords)
    .innerJoin(entrySearch, eq(entrySearch.entryId, userWords.entryId))
    .where(
      filter === "all"
        ? eq(userWords.userId, userId)
        : and(eq(userWords.userId, userId), sql`${bucketSql} = ${filter}`),
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
    bucket: bucketOf(r),
    note: r.note,
  }));
}

/** Counts by bucket, for the filter tabs. */
export async function getMyWordCounts(): Promise<Counts> {
  const userId = await requireUserId();

  const rows = await db
    .select({
      bucket: bucketSql,
      count: sql<string>`count(*)::text`,
    })
    .from(userWords)
    .where(eq(userWords.userId, userId))
    /*
     * By ordinal, not by repeating `bucketSql`. Drizzle renders a fragment
     * fresh at each use site and numbers its bind parameters per rendering, so
     * naming the CASE twice puts `>= $1` in the select and `>= $3` in the GROUP
     * BY. Postgres matches grouping expressions structurally, decides those are
     * two different expressions, and rejects the query.
     */
    .groupBy(sql`1`);

  const counts: Counts = { new: 0, learning: 0, mature: 0, retired: 0 };
  for (const row of rows) {
    if (isListFilter(row.bucket)) counts[row.bucket] = Number(row.count);
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

export const SESSION_LIMIT = 20;
/*
 * How many never-seen words a single session may introduce. Without a cap, a
 * user who saves fifty words in an afternoon gets fifty new cards and no
 * reviews, which is the one way to make spaced repetition worse than a list.
 */
export const NEW_PER_SESSION = 5;

/**
 * One review session: everything due, oldest first, topped up with a few new
 * words.
 *
 * Two queries rather than one, because the new-word cap is a separate limit and
 * SQL has no way to express "20 of these plus 5 of those" without a union that
 * gives up both index scans. Both are served by `user_words_due_idx`.
 *
 * `entry_id ASC` is not decoration: `due_at` ties are everywhere — every word
 * saved before the backfill shares one — and a LIMIT over a ranking key with
 * ties has no stable answer without a total order.
 */
export async function getReviewCards(): Promise<Card[]> {
  const userId = await requireUserId();
  const now = new Date();

  const [reviews, fresh] = await Promise.all([
    selectDue(userId, now, ne(userWords.state, 0), SESSION_LIMIT),
    selectDue(userId, now, eq(userWords.state, 0), NEW_PER_SESSION),
  ]);

  const rows = [...reviews, ...fresh].slice(0, SESSION_LIMIT);

  // Selection is deterministic; only the order the cards come up in is not.
  // Grading a run of same-age words in a row is how you learn the order rather
  // than the words.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  return rows.map((r) => ({
    entryId: r.entryId,
    headword: r.headword,
    reading: r.reading,
    romaji: r.romaji,
    glosses: r.glossSummary,
    ruby: r.ruby,
    previews: preview(r, now),
  }));
}

function selectDue(
  userId: string,
  now: Date,
  state: ReturnType<typeof eq>,
  limit: number,
) {
  return db
    .select({
      entryId: userWords.entryId,
      dueAt: userWords.dueAt,
      intervalDays: userWords.intervalDays,
      repetitions: userWords.repetitions,
      lapses: userWords.lapses,
      stability: userWords.stability,
      difficulty: userWords.difficulty,
      state: userWords.state,
      learningSteps: userWords.learningSteps,
      lastReviewAt: userWords.lastReviewAt,
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
    .where(
      and(
        eq(userWords.userId, userId),
        eq(userWords.status, "todo"),
        lte(userWords.dueAt, now),
        state,
      ),
    )
    .orderBy(asc(userWords.dueAt), asc(userWords.entryId))
    .limit(limit);
}

/**
 * When the next word comes due, or null if none is scheduled.
 *
 * Lets the empty review screen say "come back Thursday" rather than implying
 * the user is finished. Same index as the session queries, one row.
 */
export async function getNextDueAt(): Promise<Date | null> {
  const userId = await requireUserId();

  const [row] = await db
    .select({ dueAt: userWords.dueAt })
    .from(userWords)
    .where(and(eq(userWords.userId, userId), eq(userWords.status, "todo")))
    .orderBy(asc(userWords.dueAt))
    .limit(1);

  return row?.dueAt ?? null;
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
