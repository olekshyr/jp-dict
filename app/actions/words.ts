"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { users, userWords } from "@/lib/db/schema";
import { requireUserId } from "@/lib/user-words/auth";

/*
 * Server Actions are reachable by direct POST, not just through the UI, so
 * every one of these re-authenticates and validates its own input. None of them
 * accepts a user id — `requireUserId()` reads it from the session.
 *
 * They call `refresh()` rather than `revalidateTag`: user data is never cached
 * server-side, so there is no tag to expire, only a client router to re-render.
 */

const entryIdSchema = z.coerce.number().int().positive();
const statusSchema = z.enum(["todo", "learned"]);
const frontModeSchema = z.enum(["kanji", "furigana", "romaji", "english"]);

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
    .values({ userId, entryId })
    .onConflictDoNothing();

  refresh();
}

export async function removeWord(rawEntryId: unknown) {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);

  await db
    .delete(userWords)
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)));

  refresh();
}

export async function setStatus(rawEntryId: unknown, rawStatus: unknown) {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);
  const status = statusSchema.parse(rawStatus);

  await db
    .update(userWords)
    .set({
      status,
      learnedAt: status === "learned" ? new Date() : null,
    })
    // Scoped by userId as well as entryId: without it, any signed-in user could
    // mutate another user's row by guessing an entry id.
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)));

  refresh();
}

export async function setFrontMode(rawMode: unknown) {
  const userId = await requireUserId();
  const frontMode = frontModeSchema.parse(rawMode);

  await db
    .insert(users)
    .values({ id: userId, frontMode })
    .onConflictDoUpdate({ target: users.id, set: { frontMode } });

  refresh();
}
