"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { paginationHref } from "@/lib/pagination";
import type { WordStatus } from "@/lib/user-words/queries";
import { useListCounts } from "./list-session";

const FILTERS: Array<{ value: WordStatus | "all"; label: string }> = [
  { value: "todo", label: "To learn" },
  { value: "learned", label: "Learned" },
  { value: "all", label: "All" },
];

/**
 * The filter lives in the URL, so each tab is a <Link> and the active tab is
 * whatever `?filter=` says. `Tabs` is controlled by that value with no
 * onValueChange: navigation, not local state, is what moves the selection.
 * Only the badge numbers are client state.
 */
export function ListFilterTabs({
  filter,
  perPage,
}: Readonly<{ filter: WordStatus | "all"; perPage: number }>) {
  const counts = useListCounts();

  return (
    <Tabs value={filter} className="mb-6">
      <TabsList>
        {FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? counts.todo + counts.learned
              : counts[f.value as WordStatus];
          return (
            <TabsTrigger
              key={f.value}
              value={f.value}
              // The tab is an anchor, not a <button>; without this Base UI
              // warns that it is stripping native button semantics.
              nativeButton={false}
              // Carries the chosen page size across tabs but deliberately not
              // the page: a different filter is a different list, so it starts
              // at the top.
              render={
                filter == f.value ? <span /> :
                  (
                    <Link href={paginationHref("/list", { filter: f.value, perPage })} />
                  )
              }
            >
              {f.label}
              <Badge variant="secondary">{count}</Badge>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
