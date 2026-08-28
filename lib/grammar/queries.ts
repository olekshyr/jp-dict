import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { grammarRules } from "@/lib/db/schema";
import { clampQuery, escapeLikeContains } from "@/lib/dictionary/query-script";

/** How much of a body the list needs. Projected in SQL, not sliced in JS. */
const EXCERPT_LENGTH = 300;

/** A row in the grammar list. Never carries the full body. */
export type RuleSummary = {
  id: string;
  title: string;
  excerpt: string;
};

export type Rule = {
  id: string;
  title: string;
  body: string;
};

/**
 * A plain substring match over the title and the body text.
 *
 * Deliberately *not* routed through `detectScript` / `normalizeJapanese` /
 * `normalizeRomaji` the way `queryFilter` in lib/user-words/queries.ts is:
 * those exist to reach the dictionary's `search_terms` index, and there is no
 * dictionary here. A rule's title and body are free text in whatever script the
 * user chose, and `ILIKE` is a no-op lowercase for kana and kanji. Nothing here
 * is index-served, which is affordable for exactly the reason /list's search is
 * — the scan is over one user's own rows.
 */
function queryFilter(raw: string): SQL | undefined {
  const q = clampQuery(raw);
  if (q.length === 0) return undefined;

  const pattern = escapeLikeContains(q);
  return sql`(${grammarRules.title} ilike ${pattern} escape '\\'
    or ${grammarRules.bodyText} ilike ${pattern} escape '\\')`;
}

/** One page of the signed-in user's rules, newest first. */
export async function getMyRules(
  query: string,
  limit: number,
  offset: number,
): Promise<RuleSummary[]> {
  const userId = await requireUserId();

  return db
    .select({
      id: grammarRules.id,
      title: grammarRules.title,
      excerpt: sql<string>`left(${grammarRules.bodyText}, ${EXCERPT_LENGTH})`,
    })
    .from(grammarRules)
    .where(and(eq(grammarRules.userId, userId), queryFilter(query)))
    // `id` after `created_at`: the ranking key is unique in practice, but a
    // LIMIT/OFFSET list without a total order is how pages repeat and skip rows.
    .orderBy(desc(grammarRules.createdAt), asc(grammarRules.id))
    .limit(limit)
    .offset(offset);
}

/** How many rules match, for pagination and the empty states. */
export async function getMyRuleCount(query: string): Promise<number> {
  const userId = await requireUserId();

  const [row] = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(grammarRules)
    .where(and(eq(grammarRules.userId, userId), queryFilter(query)));

  return Number(row?.count ?? 0);
}

/**
 * One rule in full, or null.
 *
 * Scoped by `userId` as well as `id`, so a guessed uuid belonging to someone
 * else is indistinguishable from one that does not exist.
 */
export async function getRule(id: string): Promise<Rule | null> {
  const userId = await requireUserId();

  const [row] = await db
    .select({
      id: grammarRules.id,
      title: grammarRules.title,
      body: grammarRules.body,
    })
    .from(grammarRules)
    .where(and(eq(grammarRules.userId, userId), eq(grammarRules.id, id)))
    .limit(1);

  return row ?? null;
}
