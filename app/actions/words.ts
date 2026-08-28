"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { reviewLog, users, userWords } from "@/lib/db/schema";
import { GRADES, type Previews } from "@/lib/srs/grades";
import { schedule } from "@/lib/srs/scheduler";
import { requireUserId } from "@/lib/auth";
import { FRONT_MODES } from "@/lib/user-words/front-mode";
import { STATUS } from "@/lib/user-words/status";

/*
 * Server Actions are reachable by direct POST, not just through the UI, so
 * every one of these re-authenticates and validates its own input. None of them
 * accepts a user id — `requireUserId()` reads it from the session.
 *
 * They deliberately do not call `refresh()`. User data is never cached
 * server-side, so there is nothing to invalidate; the only thing a refresh did
 * was re-render the route, which costs a round-trip and re-runs every query on
 * the page. The client that issued the write already reflects it optimistically
 * and rolls back if the promise rejects, so these stay pure writes.
 */

/*
 * `.max` as well as `.int()`: 1e21 is an integer as far as JavaScript is
 * concerned, serializes as "1e+21", and reaches Postgres as `invalid input
 * syntax for type bigint` — a rejected input turning into a 500. `parseEntryId`
 * guards the route param the same way.
 */
const entryIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const statusSchema = z.enum([STATUS.active, STATUS.paused]);
const gradeSchema = z.enum(GRADES);
const frontModeSchema = z.enum(FRONT_MODES);
/*
 * The only free-form user text the app accepts. `z.string()` is doing real work
 * beyond typing — without it an array or object would be bound as a query
 * parameter — and this cap, not the textarea's `maxLength`, is the control:
 * a Server Action is reachable by direct POST. 2000 UTF-16 code units is ~8 KB
 * of UTF-8 worst case, comfortably inside the 1 MB body limit.
 */
const noteSchema = z.string().max(2000);

/** Lazily creates the `users` row. Avoids needing a Clerk webhook. */
async function ensureUserRow(userId: string) {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
}

export async function addWord(rawEntryId: unknown) {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);

  await ensureUserRow(userId);
  // The unique index on (user_id, entry_id) makes a double-click a no-op.
  await db
    .insert(userWords)
    // Due immediately: a word you just saved is a word you want to see. It also
    // keeps `due_at` populated on every row, which is what lets the review
    // query drop its `OR due_at IS NULL` branch.
    .values({ userId, entryId, dueAt: new Date() })
    .onConflictDoNothing();
}

export async function removeWord(rawEntryId: unknown) {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);

  await db
    .delete(userWords)
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)));
}

/**
 * Pauses reviews for a word, or resumes them.
 *
 * Deliberately touches nothing but `status`: the scheduling columns are left
 * exactly as they were, so putting a word back resumes its existing schedule
 * rather than restarting it from new. A word paused for a year comes back
 * overdue, which is the honest answer.
 */
export async function setStatus(rawEntryId: unknown, rawStatus: unknown) {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);
  const status = statusSchema.parse(rawStatus);

  await db
    .update(userWords)
    .set({
      status,
      learnedAt: status === STATUS.paused ? new Date() : null,
    })
    // Scoped by userId as well as entryId: without it, any signed-in user could
    // mutate another user's row by guessing an entry id.
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)));
}

/**
 * Records one flashcard answer and reschedules the word.
 *
 * Returns what each button would now schedule, so a card the user answered
 * "again" can go straight to the back of the deck and pick up fresh labels when
 * this settles — without shipping the scheduler to the browser.
 *
 * No optimistic-concurrency guard on the update, deliberately. A card leaves
 * the deck the instant it is clicked, so the UI cannot grade the same state
 * twice; and a guard would only skip the update while the log row still landed,
 * splitting the two apart to prevent something that isn't reachable.
 */
export async function gradeCard(
  rawEntryId: unknown,
  rawGrade: unknown,
): Promise<Previews | null> {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);
  const grade = gradeSchema.parse(rawGrade);

  const [row] = await db
    .select({
      dueAt: userWords.dueAt,
      intervalDays: userWords.intervalDays,
      repetitions: userWords.repetitions,
      lapses: userWords.lapses,
      stability: userWords.stability,
      difficulty: userWords.difficulty,
      state: userWords.state,
      learningSteps: userWords.learningSteps,
      lastReviewAt: userWords.lastReviewAt,
    })
    .from(userWords)
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)))
    .limit(1);

  // Same silence as setNote and setStatus: an entry the user hasn't saved
  // matches nothing and returns normally rather than answering whether it
  // exists.
  if (!row) return null;

  const { next, log, previews } = schedule(row, grade, new Date());

  // One request, one implicit transaction. The neon-http driver otherwise
  // sends a statement per round-trip, and a card rescheduled without its log
  // entry is history the optimizer can never recover.
  await db.batch([
    db
      .update(userWords)
      .set(next)
      .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId))),
    db.insert(reviewLog).values({ userId, entryId, ...log }),
  ]);

  return previews;
}

/**
 * Writes the user's own note on a saved word.
 *
 * Update-only, deliberately not an upsert: a note on a word the user hasn't
 * saved is meaningless, and the UI never offers one. An entry the user hasn't
 * saved simply matches 0 rows and returns normally — the same silence
 * `removeWord` and `setStatus` already have, and one that avoids turning the
 * action into an oracle for whether a row exists.
 */
export async function setNote(rawEntryId: unknown, rawNote: unknown) {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);
  const note = noteSchema.parse(rawNote).trim();

  await db
    .update(userWords)
    // Empty collapses to NULL so whitespace can't make a row look annotated.
    .set({ note: note === "" ? null : note })
    // Scoped by userId as well as entryId: without it, any signed-in user could
    // overwrite another user's note by guessing an entry id.
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)));
}

export async function setFrontMode(rawMode: unknown) {
  const userId = await requireUserId();
  const frontMode = frontModeSchema.parse(rawMode);

  await db
    .insert(users)
    .values({ id: userId, frontMode })
    .onConflictDoUpdate({ target: users.id, set: { frontMode } });
}
