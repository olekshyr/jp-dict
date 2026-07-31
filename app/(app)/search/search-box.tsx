"use client";

import { useSearchParams } from "next/navigation";

import { parsePagination } from "@/lib/pagination";
import { SearchField } from "../search-field";

/**
 * The search page's own field, seeded from `?q` so a reload or a shared link
 * shows the query that produced the results below it.
 *
 * It also reads `?perPage` back out — through the same clamp the server uses,
 * so a hand-edited value can't be laundered into the next query — and hands it
 * to the field, which carries it forward when a new search is submitted.
 */
export function SearchBox() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const { perPage } = parsePagination({
    perPage: searchParams.get("perPage") ?? undefined,
  });

  return (
    <SearchField
      // Remounting on a new URL query keeps the box in step with back/forward
      // navigation without an effect that would re-render on every keystroke.
      key={urlQuery}
      defaultValue={urlQuery}
      perPage={perPage}
      autoFocus
    />
  );
}
