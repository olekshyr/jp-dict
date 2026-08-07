import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
  filter: "todo" | "learned" | "all",
  perPage = 10,
  counts = { todo: 3, learned: 4 },
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
    renderTabs("todo");

    expect(screen.getByText("To learn").closest("a")).toBeNull();
    expect(hrefOf("Learned")).toBe("/list?filter=learned");
  });

  it("carries a non-default page size across a filter change", () => {
    renderTabs("todo", 50);

    expect(hrefOf("Learned")).toBe("/list?filter=learned&perPage=50");
  });

  it("drops the page — a different filter is a different list", () => {
    renderTabs("all", 20);

    expect(hrefOf("To learn")).not.toContain("page=");
  });

  it("sums both buckets for All", () => {
    renderTabs("todo", 10, { todo: 3, learned: 4 });

    expect(screen.getByText("All").parentElement).toHaveTextContent("7");
  });

  it("puts no spinner in the strip — the badge already owns that corner", () => {
    setLinkPending(true);
    const { container } = renderTabs("todo");

    expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
  });

  it("still reports the navigation, so the rows below can dim", () => {
    // The visual was dropped, not the reporting: without this the filter tabs
    // would go back to giving no feedback at all.
    setLinkPending(true);
    render(
      <NavPendingProvider>
        <ListSession counts={{ todo: 3, learned: 4 }}>
          <ListFilterTabs filter="todo" perPage={10} />
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
