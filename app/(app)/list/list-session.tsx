"use client";

import { createContext, useContext, useMemo, useReducer } from "react";

export type Counts = { todo: number; learned: number };

/**
 * A signed change to each bucket. Deltas rather than counts, for two reasons:
 * undoing one is negation, and the badges stay `serverCount + delta` so this
 * state never has to be reconciled against a changed prop — the class of bug
 * that made the review counter reset.
 */
export type CountDelta = Counts;

const ZERO: CountDelta = { todo: 0, learned: 0 };

function reducer(total: CountDelta, next: CountDelta): CountDelta {
  return {
    todo: total.todo + next.todo,
    learned: total.learned + next.learned,
  };
}

const CountsContext = createContext<Counts>(ZERO);
const DispatchContext = createContext<React.Dispatch<CountDelta> | null>(null);

/** The badge counts: server truth plus everything this session has changed. */
export function useListCounts() {
  return useContext(CountsContext);
}

export function useListDispatch() {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) {
    throw new Error("useListDispatch must be used inside <ListSession>");
  }
  return dispatch;
}

/**
 * Holds the optimistic count deltas for one rendering of the list.
 *
 * Two contexts, not one, and that split is load-bearing: `dispatch` is
 * identity-stable for the life of the provider, so rows — which only ever
 * write — never re-render when the counts change. Only the tab strip reads
 * CountsContext. `children` arrives from the server component, so it is the
 * same element object when this re-renders and React skips that subtree.
 */
export function ListSession({
  counts,
  children,
}: Readonly<{ counts: Counts; children: React.ReactNode }>) {
  const [delta, dispatch] = useReducer(reducer, ZERO);

  const value = useMemo(
    () => ({
      todo: counts.todo + delta.todo,
      learned: counts.learned + delta.learned,
    }),
    [counts.todo, counts.learned, delta.todo, delta.learned],
  );

  return (
    <DispatchContext value={dispatch}>
      <CountsContext value={value}>{children}</CountsContext>
    </DispatchContext>
  );
}
