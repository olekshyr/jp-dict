"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { paginationHref } from "@/lib/pagination";
import { FILTER_LABELS, LIST_FILTERS, type ListFilter } from "@/lib/srs/grades";
import { LinkPending } from "../link-pending";
import { useListCounts } from "./list-session";

const FILTERS: Array<{ value: ListFilter | "all"; label: string }> = [
  ...LIST_FILTERS.map((value) => ({ value, label: FILTER_LABELS[value] })),
  { value: "all" as const, label: "All" },
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
}: Readonly<{ filter: ListFilter | "all"; perPage: number }>) {
  const counts = useListCounts();
  const total = LIST_FILTERS.reduce((sum, key) => sum + counts[key], 0);

  return (
    <Tabs value={filter} className="mb-6">
      <TabsList>
        {FILTERS.map((f) => {
          const count = f.value === "all" ? total : counts[f.value];
          const isActive = filter === f.value;
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
                isActive ? (
                  <span />
                ) : (
                  <Link
                    href={paginationHref("/list", {
                      filter: f.value,
                      perPage,
                    })}
                  />
                )
              }
            >
              {f.label}
              <Badge variant="secondary">{count}</Badge>
              {/*
                Only the inactive tabs are links, and only a link has a pending
                state to report. Reporting with no spinner of its own: the tab
                already carries a count badge, so the feedback for a filter
                click is the rows below dimming.
              */}
              {!isActive && <LinkPending spinner={false} />}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
