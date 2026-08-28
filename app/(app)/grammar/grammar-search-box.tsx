"use client";

import { useSearchParams } from "next/navigation";

import { parsePagination } from "@/lib/pagination";
import { SearchField } from "../search-field";

export const GRAMMAR_SEARCH_LABEL = "Search my grammar rules";
export const GRAMMAR_SEARCH_PLACEHOLDER = "Search by title or what you wrote…";

/**
 * The third caller of `SearchField`, and it needed no change there — `pathname`,
 * `params`, `placeholder` and `label` have been props since /list got its own
 * box.
 */
export function GrammarSearchBox() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const { perPage } = parsePagination({
    perPage: searchParams.get("perPage") ?? undefined,
  });

  return (
    <SearchField
      key={urlQuery}
      defaultValue={urlQuery}
      pathname="/grammar"
      perPage={perPage}
      placeholder={GRAMMAR_SEARCH_PLACEHOLDER}
      label={GRAMMAR_SEARCH_LABEL}
    />
  );
}
