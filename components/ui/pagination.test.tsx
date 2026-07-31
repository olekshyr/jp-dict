import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Pagination,
  PaginationEllipsis,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination";

/**
 * The one primitive here that isn't a straight shadcn re-export: PaginationLink
 * clones the `render` element to inject the active-state attributes, and that
 * cloning is easy to break silently.
 */

describe("PaginationLink", () => {
  it("renders a plain anchor by default", () => {
    render(<PaginationLink href="/search?page=2">2</PaginationLink>);

    const link = screen.getByText("2");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("data-slot", "pagination-link");
    expect(link).toHaveAttribute("href", "/search?page=2");
  });

  it('is exposed as role="button", not a link', () => {
    // Base UI's Button owns the role, and `nativeButton={false}` only changes
    // the tag it renders — so an <a href> here still announces as a button.
    // Pinned deliberately: it is a real a11y trade-off, not an accident of
    // this test, and changing it should be a conscious edit.
    render(<PaginationLink href="/search?page=2">2</PaginationLink>);

    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks the active page for screen readers", () => {
    render(
      <PaginationLink isActive href="/search?page=2">
        2
      </PaginationLink>,
    );

    const link = screen.getByText("2");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("data-active", "true");
  });

  it("leaves aria-current off an inactive page", () => {
    render(<PaginationLink href="/search?page=3">3</PaginationLink>);

    expect(screen.getByText("3")).not.toHaveAttribute("aria-current");
  });

  it("renders as whatever `render` says, keeping the props passed alongside", () => {
    render(
      <PaginationLink
        render={<span />}
        aria-label="Go to next page"
        className="opacity-50"
      >
        4
      </PaginationLink>,
    );

    const el = screen.getByLabelText("Go to next page");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveClass("opacity-50");
    expect(el).toHaveAttribute("data-slot", "pagination-link");
  });
});

describe("PaginationPrevious / PaginationNext", () => {
  it("label themselves for screen readers and show default text", () => {
    render(
      <>
        <PaginationPrevious href="/search?page=1" />
        <PaginationNext href="/search?page=3" />
      </>,
    );

    expect(screen.getByLabelText("Go to previous page")).toHaveTextContent(
      "Previous",
    );
    expect(screen.getByLabelText("Go to next page")).toHaveTextContent("Next");
  });

  it("accepts custom text", () => {
    render(<PaginationNext href="/search?page=3" text="Older" />);

    expect(screen.getByLabelText("Go to next page")).toHaveTextContent("Older");
  });
});

describe("PaginationEllipsis", () => {
  it("is hidden from the accessibility tree but explains itself to a reader", () => {
    const { container } = render(<PaginationEllipsis />);

    const ellipsis = container.querySelector(
      '[data-slot="pagination-ellipsis"]',
    );
    expect(ellipsis).toHaveAttribute("aria-hidden");
    expect(ellipsis).toHaveTextContent("More pages");
  });
});

describe("Pagination", () => {
  it("is a labelled navigation landmark", () => {
    render(<Pagination />);

    expect(screen.getByRole("navigation", { name: "pagination" })).toBeInTheDocument();
  });
});
