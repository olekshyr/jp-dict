"use client";

import { createContext, useContext } from "react";

import type { WordStatus } from "@/lib/user-words/queries";

export type RowApi = {
  /**
   * Optimistically moves this row to `to`, removing it if it leaves the
   * filter. Returns a token identifying this write — pass it back to
   * `rollback` so a second button's write in flight on the same row cannot be
   * undone by this one's failure, or vice versa.
   */
  setStatus: (to: WordStatus) => symbol;
  /** Optimistically unsaves this row, which always removes it. Returns a
   *  token, see `setStatus`. */
  unsave: () => symbol;
  /**
   * Undoes the optimistic change identified by `token`, counts included. A
   * no-op if `token` is not the row's current pending write — either it
   * already settled, or a second write superseded it.
   */
  rollback: (token: symbol | undefined) => void;
};

export const RowContext = createContext<RowApi | null>(null);

/**
 * The row this button sits in, or null on /search and /entry/[id] where there
 * is none.
 *
 * Deliberately here rather than beside `ListRow`: SaveButton is shared with
 * those routes, and importing from `list/` would pull the whole list layer
 * into their bundles.
 */
export function useRow() {
  return useContext(RowContext);
}
