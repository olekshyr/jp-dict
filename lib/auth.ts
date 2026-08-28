import "server-only";

import { auth } from "@clerk/nextjs/server";

/**
 * Resolves the signed-in Clerk user id, throwing if there isn't one.
 *
 * Every read and write in this directory calls this itself rather than
 * accepting a `userId` argument. That is the whole safety property: a caller
 * cannot pass someone else's id, because there is no parameter to pass it
 * through. Server Actions and Server Components are reachable by direct POST
 * without ever rendering the layout that guards these routes, so the check has
 * to live here rather than only in the UI.
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}
