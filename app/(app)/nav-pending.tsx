"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";

type NavPending = Readonly<{
  /** True while any URL change is in flight, whatever started it. */
  pending: boolean;
  /** For controls that navigate imperatively: the search form, the page-size select. */
  startNavigation: React.TransitionStartFunction;
  /** For <Link> clicks, which the router owns rather than a transition of ours. */
  reportLinkPending: (id: string, pending: boolean) => void;
}>;

const NavPendingContext = createContext<NavPending | null>(null);

/**
 * One pending flag for every URL change in the signed-in app, so a navigation
 * in flight can spin its own control *and* mark the content it is about to
 * replace as stale.
 *
 * It exists because a client navigation that only changes search params reuses
 * an already-mounted <Suspense> boundary, and React holds the old content on
 * screen rather than falling back to the skeleton. Without this the entire
 * server round-trip is invisible: the rows sit there looking current.
 *
 * Mounted once in the layout rather than per route. It reads nothing from the
 * request, so the static shell is unaffected, and living above the pages means
 * it is never torn down mid-flight by the navigation it is reporting on.
 *
 * Two sources feed it, because the app navigates two ways. `startNavigation`
 * wraps a `router.push`. `reportLinkPending` is written by <LinkPending> from
 * `useLinkStatus`, which is the only way to observe a <Link> click — those are
 * the router's own transition, not one we can start.
 */
export function NavPendingProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [transitionPending, startNavigation] = useTransition();
  const [linkIds, setLinkIds] = useState<ReadonlySet<string>>(() => new Set());

  /*
   * A set of ids rather than a boolean. Clicking a second link before the first
   * settles would otherwise let the earlier one clear the flag on its way out
   * and leave the UI looking idle while a navigation is still running.
   */
  const reportLinkPending = useCallback((id: string, pending: boolean) => {
    setLinkIds((current) => {
      if (current.has(id) === pending) return current;
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      pending: transitionPending || linkIds.size > 0,
      startNavigation,
      reportLinkPending,
    }),
    [transitionPending, linkIds, startNavigation, reportLinkPending],
  );

  return <NavPendingContext value={value}>{children}</NavPendingContext>;
}

export function useNavPending(): NavPending {
  const value = useContext(NavPendingContext);
  if (!value) {
    throw new Error("useNavPending must be used inside <NavPendingProvider>");
  }
  return value;
}
