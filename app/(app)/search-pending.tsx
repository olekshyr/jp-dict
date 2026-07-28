"use client";

import { createContext, useContext, useMemo, useTransition } from "react";

type SearchPending = Readonly<{
  pending: boolean;
  startSearch: React.TransitionStartFunction;
}>;

const SearchPendingContext = createContext<SearchPending | null>(null);

/**
 * Shares one transition between the search box and the results below it, so a
 * query in flight can show a spinner in the field *and* dim the stale results.
 *
 * It sits above <SearchBox> deliberately: the box remounts itself on every URL
 * change, and a transition owned further down would be torn down mid-flight.
 */
export function SearchPendingProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [pending, startSearch] = useTransition();
  const value = useMemo(() => ({ pending, startSearch }), [pending]);

  return (
    <SearchPendingContext value={value}>{children}</SearchPendingContext>
  );
}

/**
 * The shared transition where a provider is present, and a private one where it
 * isn't — the search field also appears on entry pages, which have no results
 * list to dim but should still show the field's own spinner. The local
 * `useTransition` runs unconditionally because hooks must; it is simply unused
 * when the context wins.
 */
export function useSearchPending(): SearchPending {
  const shared = useContext(SearchPendingContext);
  const [pending, startSearch] = useTransition();

  return shared ?? { pending, startSearch };
}
