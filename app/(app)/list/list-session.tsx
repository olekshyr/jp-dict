"use client";

import { createContext, useContext, useMemo, useReducer } from "react";

import { LIST_FILTERS, type Counts } from "@/lib/srs/grades";

export type { Counts };

/**
 * A signed change to each bucket. Deltas rather than counts, for two reasons:
 * undoing one is negation, and the badges stay `serverCount + delta` so this
 * state never has to be reconciled against a changed prop — the class of bug
 * that made the review counter reset.
 *
 * Partial because a move only ever touches the two buckets it moves between,
 * and naming the other two as zeroes is noise a caller can get wrong.
 */
export type CountDelta = Partial<Counts>;

const ZERO: Counts = { new: 0, learning: 0, mature: 0, retired: 0 };

export function negate(delta: CountDelta): CountDelta {
  const out: CountDelta = {};
  for (const bucket of LIST_FILTERS) {
    const value = delta[bucket];
    if (value) out[bucket] = -value;
  }
  return out;
}

function reducer(total: Counts, next: CountDelta): Counts {
  const out = { ...total };
  for (const bucket of LIST_FILTERS) out[bucket] += next[bucket] ?? 0;
  return out;
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

  const value = useMemo(() => reducer(counts, delta), [counts, delta]);

  return (
    <DispatchContext value={dispatch}>
      <CountsContext value={value}>{children}</CountsContext>
    </DispatchContext>
  );
}
