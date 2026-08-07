import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setLinkPending } from "@/test/next-link";
import { NavPendingProvider } from "./nav-pending";
import { PaginationBar } from "./pagination-bar";

/**
 * A synchronous server component, so it renders here like any other function
 * component. The assertions are all on real `href` attributes — that exercises
 * the URL vocabulary this component owns end to end, rather than restating
 * `paginationHref` (which has its own tests).
 *
 * It renders client islands (the page-size select, the per-link pending
 * spinners) that read the navigation-pending context, which the (app) layout
 * provides in the real app.
 */

const renderBar = (ui: React.ReactElement) =>
  render(<NavPendingProvider>{ui}</NavPendingProvider>);

const hrefsOf = (container: HTMLElement) =>
  [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));

describe("PaginationBar", () => {
  it("renders nothing when even the smallest page size fits everything", () => {
    const { container } = renderBar(
      <PaginationBar pathname="/list" page={1} perPage={10} total={10} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the bar as soon as a second page exists", () => {
    renderBar(<PaginationBar pathname="/list" page={1} perPage={10} total={11} />);

    expect(
      screen.getByRole("navigation", { name: "pagination" }),
    ).toBeInTheDocument();
  });

  it("makes Previous inert on the first page", () => {
    renderBar(<PaginationBar pathname="/list" page={1} perPage={10} total={50} />);

    const previous = screen.getByLabelText("Go to previous page");
    expect(previous.tagName).toBe("SPAN");
    expect(previous).toHaveAttribute("aria-disabled");

    expect(screen.getByLabelText("Go to next page").tagName).toBe("A");
  });

  it("makes Next inert on the last page", () => {
    renderBar(<PaginationBar pathname="/list" page={5} perPage={10} total={50} />);

    const next = screen.getByLabelText("Go to next page");
    expect(next.tagName).toBe("SPAN");
    expect(next).toHaveAttribute("aria-disabled");

    expect(screen.getByLabelText("Go to previous page").tagName).toBe("A");
  });

  it("marks the current page", () => {
    renderBar(<PaginationBar pathname="/list" page={3} perPage={10} total={50} />);

    expect(screen.getByText("3")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("2")).not.toHaveAttribute("aria-current");
  });

  it("carries the route's own params through every page link", () => {
    const { container } = renderBar(
      <PaginationBar
        pathname="/search"
        params={{ q: "cat" }}
        page={2}
        perPage={10}
        total={50}
      />,
    );

    for (const href of hrefsOf(container)) {
      expect(href).toContain("q=cat");
    }
    expect(hrefsOf(container)).toContain("/search?q=cat&page=3");
  });

  it("drops page=1 and the default page size from the hrefs it builds", () => {
    const { container } = renderBar(
      <PaginationBar
        pathname="/search"
        params={{ q: "cat" }}
        page={2}
        perPage={10}
        total={50}
      />,
    );

    // Back to page 1 is the bare query, and perPage=10 never appears.
    expect(hrefsOf(container)).toContain("/search?q=cat");
    expect(hrefsOf(container).join(" ")).not.toContain("perPage=10");
  });

  it("keeps a non-default page size on every link", () => {
    const { container } = renderBar(
      <PaginationBar pathname="/list" page={2} perPage={50} total={500} />,
    );

    expect(hrefsOf(container)).toContain("/list?page=3&perPage=50");
  });

  it("elides the middle of a long range", () => {
    const { container } = renderBar(
      <PaginationBar pathname="/list" page={10} perPage={10} total={200} />,
    );

    expect(
      container.querySelectorAll('[data-slot="pagination-ellipsis"]'),
    ).toHaveLength(2);
  });

  it("shows the current page size alongside the pages", () => {
    renderBar(<PaginationBar pathname="/list" page={4} perPage={20} total={500} />);

    expect(screen.getByLabelText("Rows per page")).toHaveTextContent("20");
  });

  it("gives every navigating link a pending affordance, and inert ones none", () => {
    setLinkPending(true);
    const { container } = renderBar(
      <PaginationBar pathname="/list" page={3} perPage={10} total={50} />,
    );

    // Previous, Next and each page number except the current one. The active
    // page is still an anchor but clicking it starts no navigation.
    const links = [...container.querySelectorAll("a")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const spins = link.querySelector(".animate-spin") !== null;
      expect(spins).toBe(link.getAttribute("aria-current") !== "page");
    }
  });

  it("keeps the chevron and label alongside the spinner", () => {
    // PaginationPrevious/Next append the slot rather than replacing their own
    // content; a regression there would silently drop the visible label.
    renderBar(<PaginationBar pathname="/list" page={3} perPage={10} total={50} />);

    expect(screen.getByLabelText("Go to previous page")).toHaveTextContent(
      "Previous",
    );
    expect(screen.getByLabelText("Go to next page")).toHaveTextContent("Next");
  });

  it("shows no spinner while nothing is navigating", () => {
    const { container } = renderBar(
      <PaginationBar pathname="/list" page={3} perPage={10} total={50} />,
    );

    expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
  });
});
