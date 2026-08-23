import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { router } from "@/test/next-navigation";
import { NavPendingProvider } from "./nav-pending";
import { SearchField } from "./search-field";

const renderField = (ui: React.ReactElement) =>
  render(<NavPendingProvider>{ui}</NavPendingProvider>);

const submit = async (query: string, label = "Search the dictionary") => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: query } });
  await act(async () => {
    fireEvent.submit(input.closest("form")!);
  });
};

describe("SearchField", () => {
  it("navigates to the search page with the query", async () => {
    renderField(<SearchField />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("trims the query", async () => {
    renderField(<SearchField />);
    await submit("  neko  ");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("carries a non-default page size across a new query", async () => {
    renderField(<SearchField perPage={50} />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/search?q=neko&perPage=50",
    );
  });

  it("leaves the default page size out of the URL", async () => {
    renderField(<SearchField perPage={10} />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("drops the page number — a new result set starts at the top", async () => {
    renderField(<SearchField perPage={50} />);
    await submit("neko");

    expect(String(router.push.mock.lastCall?.[0])).not.toContain("page=");
  });

  it("goes to the bare search page on an empty query", async () => {
    renderField(<SearchField />);
    await submit("   ");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search");
  });

  it("seeds the field from defaultValue", () => {
    renderField(<SearchField defaultValue="cat" />);

    expect(screen.getByLabelText("Search the dictionary")).toHaveValue("cat");
  });

  it("refuses to mount outside a NavPendingProvider", () => {
    expect(() => render(<SearchField />)).toThrow(/NavPendingProvider/);
  });

  it("marks the form idle once the navigation has settled", async () => {
    renderField(<SearchField />);
    await submit("neko");

    expect(
      screen.getByLabelText("Search the dictionary").closest("form"),
    ).toHaveAttribute("aria-busy", "false");
  });

  it("runs the query when the Search button is clicked", async () => {
    renderField(<SearchField />);
    const input = screen.getByLabelText("Search the dictionary");
    fireEvent.change(input, { target: { value: "neko" } });
    await act(async () => {
      // A click, not a submit event: this is what would catch the button
      // losing its `type="submit"` and quietly submitting nothing.
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
    });

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/search?q=neko");
  });

  it("disables the button along with the field", () => {
    renderField(<SearchField disabled />);

    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  it("submits to another route", async () => {
    renderField(<SearchField pathname="/list" />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/list?q=neko");
  });

  it("carries the route's own params through the new query", async () => {
    renderField(<SearchField pathname="/list" params={{ filter: "mature" }} />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/list?filter=mature&q=neko",
    );
  });

  it("drops a param the route left undefined", async () => {
    renderField(<SearchField pathname="/list" params={{ filter: undefined }} />);
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/list?q=neko");
  });

  it("keeps the route's params when the query is cleared", async () => {
    renderField(<SearchField pathname="/list" params={{ filter: "paused" }} />);
    await submit("  ");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/list?filter=paused");
  });

  it("labels itself for the route it belongs to", async () => {
    renderField(<SearchField label="Search my saved words" />);

    expect(screen.getByLabelText("Search my saved words")).toBeInTheDocument();
  });
});
