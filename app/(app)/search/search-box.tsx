"use client";

import { useSearchParams } from "next/navigation";

import { SearchField } from "../search-field";

/**
 * The search page's own field, seeded from `?q` so a reload or a shared link
 * shows the query that produced the results below it.
 */
export function SearchBox() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  return (
    <SearchField
      // Remounting on a new URL query keeps the box in step with back/forward
      // navigation without an effect that would re-render on every keystroke.
      key={urlQuery}
      defaultValue={urlQuery}
      autoFocus
    />
  );
}
