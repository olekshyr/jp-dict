import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { router } from "@/test/next-navigation";
import { SearchField } from "./search-field";
import { SearchPendingProvider } from "./search-pending";

const submit = async (query: string) => {
  const input = screen.getByLabelText("Search the dictionary");
  fireEvent.change(input, { target: { value: query } });
  await act(async () => {
    fireEvent.submit(input.closest("form")!);
  });
};

describe("SearchField", () => {
  it("navigates to the search page with the query", async () => {
    render(<SearchField />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("trims the query", async () => {
    render(<SearchField />);
    await submit("  neko  ");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("carries a non-default page size across a new query", async () => {
    render(<SearchField perPage={50} />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/search?q=neko&perPage=50",
    );
  });

  it("leaves the default page size out of the URL", async () => {
    render(<SearchField perPage={10} />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("drops the page number — a new result set starts at the top", async () => {
    render(<SearchField perPage={50} />);
    await submit("neko");

    expect(String(router.push.mock.lastCall?.[0])).not.toContain("page=");
  });

  it("goes to the bare search page on an empty query", async () => {
    render(<SearchField />);
    await submit("   ");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search");
  });

  it("seeds the field from defaultValue", () => {
    render(<SearchField defaultValue="cat" />);

    expect(screen.getByLabelText("Search the dictionary")).toHaveValue("cat");
  });

  it("works without a SearchPendingProvider, on its own transition", async () => {
    // Entry pages mount the field with no results list to dim; the hook falls
    // back to a private transition rather than throwing.
    render(<SearchField />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("shares the provider's transition when one is mounted", async () => {
    render(
      <SearchPendingProvider>
        <SearchField />
      </SearchPendingProvider>,
    );
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("marks the form idle once the navigation has settled", async () => {
    render(<SearchField />);
    await submit("neko");

    expect(
      screen.getByLabelText("Search the dictionary").closest("form"),
    ).toHaveAttribute("aria-busy", "false");
  });
});
