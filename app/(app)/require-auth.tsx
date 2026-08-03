import { auth } from "@clerk/nextjs/server";

/**
 * Serialises the sign-in check ahead of whatever it wraps. The layout's
 * AuthGate is a concurrent Suspense sibling, so on its own it redirects
 * *around* work, not before it — anything that must not run for an anonymous
 * request (in practice: dictionary queries, whose data layer is deliberately
 * user-blind and cacheable) goes inside this instead. React does not render an
 * async component's children until it resolves, so a Neon miss behind a
 * `use cache` child waits on auth here.
 */
export async function RequireAuth({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await auth.protect();
  return children;
}
