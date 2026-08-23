import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Counts, ListFilter } from "@/lib/srs/grades";
import { setLinkPending } from "@/test/next-link";
import { NavPendingProvider } from "../nav-pending";
import { PendingContent } from "../pending-content";
import { ListFilterTabs } from "./list-filter-tabs";
import { ListSession } from "./list-session";

/**
 * The tab strip owns a slice of the URL vocabulary — which params survive a
 * filter change and which do not — so the assertions are on hrefs, as in
 * pagination-bar.test.tsx.
 *
 * Base UI keeps role="button" on an anchor rendered through TabsTrigger, so
 * these are queried by text rather than getByRole("link").
 */

const renderTabs = (
  filter: ListFilter | "all",
  perPage = 10,
  counts: Counts = { new: 3, learning: 4, mature: 2, paused: 1 },
) =>
  render(
    <NavPendingProvider>
      <ListSession counts={counts}>
        <ListFilterTabs filter={filter} perPage={perPage} />
      </ListSession>
    </NavPendingProvider>,
  );

const hrefOf = (label: string) =>
  screen.getByText(label).closest("a")?.getAttribute("href") ?? null;

describe("ListFilterTabs", () => {
  it("renders the active filter as plain text, not a link", () => {
    renderTabs("new");

    expect(screen.getByText("New").closest("a")).toBeNull();
    expect(hrefOf("Paused")).toBe("/list?filter=paused");
  });

  it("carries a non-default page size across a filter change", () => {
    renderTabs("new", 50);

    expect(hrefOf("Mature")).toBe("/list?filter=mature&perPage=50");
  });

  it("drops the page — a different filter is a different list", () => {
    renderTabs("all", 20);

    expect(hrefOf("New")).not.toContain("page=");
  });

  it("offers a tab for every bucket, paused included", () => {
    renderTabs("all");

    for (const label of ["New", "Learning", "Mature", "Paused", "All"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("sums every bucket for All", () => {
    renderTabs("new", 10, { new: 3, learning: 4, mature: 2, paused: 1 });

    expect(screen.getByText("All").parentElement).toHaveTextContent("10");
  });

  it("puts no spinner in the strip — the badge already owns that corner", () => {
    setLinkPending(true);
    const { container } = renderTabs("new");

    expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
  });

  it("still reports the navigation, so the rows below can dim", () => {
    // The visual was dropped, not the reporting: without this the filter tabs
    // would go back to giving no feedback at all.
    setLinkPending(true);
    render(
      <NavPendingProvider>
        <ListSession counts={{ new: 3, learning: 4, mature: 2, paused: 1 }}>
          <ListFilterTabs filter="new" perPage={10} />
        </ListSession>
        <PendingContent>
          <p>rows</p>
        </PendingContent>
      </NavPendingProvider>,
    );

    expect(screen.getByText("rows").parentElement).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
