import "server-only";

import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { entrySearch, furigana, users, userWords } from "@/lib/db/schema";
import type { RubySegment } from "@/lib/db/schema";
import {
  ALL,
  BUCKET,
  isListFilter,
  MATURE_DAYS,
  PAUSED,
  type Bucket,
  type Counts,
  type FilterValue,
  type ListFilter,
  type Previews,
} from "@/lib/srs/grades";
import type { HourBucket } from "@/lib/srs/forecast";
import { bucketOf, preview } from "@/lib/srs/scheduler";
import { requireUserId } from "./auth";
import {
  DEFAULT_FRONT_MODE,
  isFrontMode,
  type FrontMode,
} from "./front-mode";
import { STATUS, type WordStatus } from "./status";

export type { WordStatus };

/**
 * Which bucket a row falls in, in SQL.
 *
 * Duplicates `bucketOf` deliberately: filtering and counting have to happen in
 * the database, and reading every row back to bucket it in JavaScript would
 * turn a paged list into a full scan. The two are pinned together by the tests
 * in lib/srs/scheduler.test.ts and by `MATURE_DAYS` being the only threshold.
 */
const bucketSql = sql<ListFilter>`case
    when ${userWords.status} = ${STATUS.paused} then ${PAUSED}::text
    when ${userWords.state} = 0 then ${BUCKET.new}::text
    when ${userWords.state} = 2
      and coalesce(${userWords.intervalDays}, 0) >= ${MATURE_DAYS} then ${BUCKET.mature}::text
    else ${BUCKET.learning}::text
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
   * Always the schedule-derived bucket, never "paused" — pausing does not
   * touch the schedule, so this is the bucket the word returns to when it comes
   * back. What the row *displays* is `status === STATUS.paused ? PAUSED : bucket`.
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

export type { FrontMode };

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
  filter: FilterValue,
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
      filter === ALL
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

  const counts: Counts = { new: 0, learning: 0, mature: 0, paused: 0 };
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

/** A payload bound, not a session size. See "no cap on new words" in AGENTS.md. */
const MAX_DECK = 500;

/** The review queue: everything due, oldest first. */
export async function getReviewCards(): Promise<Card[]> {
  const userId = await requireUserId();
  const now = new Date();

  const rows = await db
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
        eq(userWords.status, STATUS.active),
        lte(userWords.dueAt, now),
      ),
    )
    .orderBy(asc(userWords.dueAt), asc(userWords.entryId))
    .limit(MAX_DECK);

  // Selection is deterministic; the order words come up in is not.
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
    .where(and(eq(userWords.userId, userId), eq(userWords.status, STATUS.active)))
    .orderBy(asc(userWords.dueAt))
    .limit(1);

  return row?.dueAt ?? null;
}

/**
 * The coming week's workload, in hourly buckets — at most 168 rows.
 *
 * Hours, not days: the server has no timezone to resolve them against. See
 * "the forecast is bucketed by hour" in AGENTS.md.
 */
export async function getDueForecast(): Promise<HourBucket[]> {
  const userId = await requireUserId();

  const rows = await db
    .select({
      // greatest(): everything overdue collapses into the current hour.
      hour: sql<string>`greatest(
        date_trunc('hour', ${userWords.dueAt}),
        date_trunc('hour', now())
      )`,
      count: sql<string>`count(*)::text`,
    })
    .from(userWords)
    .where(
      and(
        eq(userWords.userId, userId),
        eq(userWords.status, STATUS.active),
        sql`${userWords.dueAt} < now() + interval '7 days'`,
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows.map((r) => ({
    hour: new Date(r.hour).toISOString(),
    count: Number(r.count),
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

  const mode = row?.frontMode ?? DEFAULT_FRONT_MODE;
  return isFrontMode(mode) ? mode : DEFAULT_FRONT_MODE;
}
