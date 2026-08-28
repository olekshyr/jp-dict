"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { grammarRules } from "@/lib/db/schema";
import { sanitizeBody } from "@/lib/grammar/sanitize";

/*
 * Same rules as app/actions/words.ts: reachable by direct POST, so every action
 * re-authenticates, takes no user id, and validates its own input. No
 * `refresh()` — see the note there.
 *
 * Unlike the word actions, none of these calls `ensureUserRow`. `user_id` is
 * not a foreign key and `users` holds nothing a rule needs.
 */

const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(200);
/*
 * Capped *before* sanitizing, so an oversized payload is rejected rather than
 * handed to the parser. 20k against `noteSchema`'s 2k because this is markup:
 * a few hundred words of formatted text runs several times its own length in
 * tags, and it is still far inside the 1 MB body limit.
 */
const bodySchema = z.string().max(20_000);

/** The sanitized body, so the client can adopt what was actually stored. */
export async function createRule(
  rawTitle: unknown,
  rawBody: unknown,
): Promise<{ id: string; body: string }> {
  const userId = await requireUserId();
  const title = titleSchema.parse(rawTitle);
  const { body, bodyText } = sanitizeBody(bodySchema.parse(rawBody));

  const [row] = await db
    .insert(grammarRules)
    .values({ userId, title, body, bodyText })
    .returning({ id: grammarRules.id });

  return { id: row.id, body };
}

/**
 * Rewrites a rule the user owns.
 *
 * Returns the sanitized body rather than nothing: the client holds the raw
 * editor output, and without this the view after an edit would show markup that
 * differs from what is stored until the next reload.
 *
 * Returns null when nothing matched — the same silence `setNote` and
 * `setStatus` keep, rather than answering whether a row exists.
 */
export async function updateRule(
  rawId: unknown,
  rawTitle: unknown,
  rawBody: unknown,
): Promise<{ body: string } | null> {
  const userId = await requireUserId();
  const id = idSchema.parse(rawId);
  const title = titleSchema.parse(rawTitle);
  const { body, bodyText } = sanitizeBody(bodySchema.parse(rawBody));

  const updated = await db
    .update(grammarRules)
    .set({ title, body, bodyText, updatedAt: new Date() })
    // Scoped by userId as well as id: without it, any signed-in user could
    // overwrite another user's rule by guessing a uuid.
    .where(and(eq(grammarRules.userId, userId), eq(grammarRules.id, id)))
    .returning({ id: grammarRules.id });

  return updated.length > 0 ? { body } : null;
}

export async function deleteRule(rawId: unknown) {
  const userId = await requireUserId();
  const id = idSchema.parse(rawId);

  await db
    .delete(grammarRules)
    .where(and(eq(grammarRules.userId, userId), eq(grammarRules.id, id)));
}
