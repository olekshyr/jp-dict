"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type SavedApi = {
  /**
   * Whether the entry is saved, or `null` for "nobody has clicked yet — trust
   * what the server rendered". Keeping the unknown state means the provider
   * carries only *overrides*, so it needs no awaited data and can sit above the
   * <Suspense> boundaries that fetch it.
   */
  saved: boolean | null;
  setSaved: (saved: boolean) => void;
};

const SavedContext = createContext<SavedApi | null>(null);

/**
 * The entry-level saved state shared by <SaveButton> and the note panel, or
 * null on /search and /list where nothing needs to observe the toggle.
 *
 * It exists because the note area is hidden until the word is saved, and
 * SaveButton owns that boolean in local state no sibling can see — without
 * this, saving on /entry/[id] would leave the note area missing until a
 * reload. Deliberately here rather than under `entry/[id]/`, for the same
 * reason `row-context.tsx` is: SaveButton is shared, and importing from a
 * route folder would drag it into every other route's bundle.
 */
export function useSaved() {
  return useContext(SavedContext);
}

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const api = useMemo<SavedApi>(() => ({ saved, setSaved }), [saved]);

  return <SavedContext value={api}>{children}</SavedContext>;
}
