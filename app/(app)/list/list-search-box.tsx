"use client";

import { useSearchParams } from "next/navigation";

import { parsePagination } from "@/lib/pagination";
import { SearchField } from "../search-field";

export const LIST_SEARCH_LABEL = "Search my saved words";
export const LIST_SEARCH_PLACEHOLDER = "Search my list by word, meaning or note…";

export function ListSearchBox() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const filter = searchParams.get("filter") ?? undefined;
  const { perPage } = parsePagination({
    perPage: searchParams.get("perPage") ?? undefined,
  });

  return (
    <SearchField
      key={urlQuery}
      defaultValue={urlQuery}
      pathname="/list"
      params={{ filter }}
      perPage={perPage}
      placeholder={LIST_SEARCH_PLACEHOLDER}
      label={LIST_SEARCH_LABEL}
    />
  );
}
