import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { router } from "@/test/next-navigation";
import { NavPendingProvider } from "./nav-pending";
import { RowsPerPageSelect } from "./rows-per-page-select";

// The provider is mounted in the (app) layout in the real app; the select
// navigates inside its transition, so every render here goes through it.
const renderSelect = (ui: React.ReactElement) =>
  render(<NavPendingProvider>{ui}</NavPendingProvider>);

/**
 * The island is deliberately dumb — every target URL is built on the server —
 * so what is worth pinning is that it pushes the href it was handed, and that
 * those hrefs carry no `page` (a new page size starts at the top).
 */

const options = [
  { value: 10, href: "/search?q=cat" },
  { value: 20, href: "/search?q=cat&perPage=20" },
  { value: 50, href: "/search?q=cat&perPage=50" },
  { value: 100, href: "/search?q=cat&perPage=100" },
];

describe("RowsPerPageSelect", () => {
  it("shows the current value", () => {
    renderSelect(<RowsPerPageSelect value={50} options={options} />);

    expect(screen.getByLabelText("Rows per page")).toHaveTextContent("50");
  });

  it("pushes the href it was given, page and all left to the server", () => {
    renderSelect(<RowsPerPageSelect value={10} options={options} />);

    fireEvent.click(screen.getByLabelText("Rows per page"));
    // Base UI commits a Select item off the whole pointer sequence, not a bare
    // click — hence the four events rather than one.
    const option = screen.getByRole("option", { name: "100" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);

    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/search?q=cat&perPage=100",
    );
    // None of the options carry a page: changing the size returns to page 1.
    expect(options.map((o) => o.href).join(" ")).not.toContain("page=");
  });
});
