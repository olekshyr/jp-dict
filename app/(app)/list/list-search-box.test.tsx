import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { router, setSearchParams } from "@/test/next-navigation";
import { NavPendingProvider } from "../nav-pending";
import { LIST_SEARCH_LABEL, ListSearchBox } from "./list-search-box";

const renderBox = () =>
  render(
    <NavPendingProvider>
      <ListSearchBox />
    </NavPendingProvider>,
  );

const submit = async (query: string) => {
  const input = screen.getByLabelText(LIST_SEARCH_LABEL);
  fireEvent.change(input, { target: { value: query } });
  await act(async () => {
    fireEvent.submit(input.closest("form")!);
  });
};

describe("ListSearchBox", () => {
  it("seeds the field from ?q", () => {
    setSearchParams({ q: "neko" });
    renderBox();

    expect(screen.getByLabelText(LIST_SEARCH_LABEL)).toHaveValue("neko");
  });

  it("starts empty when there is no query", () => {
    renderBox();

    expect(screen.getByLabelText(LIST_SEARCH_LABEL)).toHaveValue("");
  });

  it("searches within the list, not the dictionary", async () => {
    renderBox();
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/list?q=neko");
  });

  it("stays in the current bucket", async () => {
    setSearchParams({ filter: "mature" });
    renderBox();
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/list?filter=mature&q=neko",
    );
  });

  it("carries a non-default page size and drops the page", async () => {
    setSearchParams({ filter: "mature", perPage: "50", page: "3" });
    renderBox();
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/list?filter=mature&q=neko&perPage=50",
    );
  });

  it("clamps a hand-edited page size rather than carrying it forward", async () => {
    setSearchParams({ perPage: "999999" });
    renderBox();
    await submit("neko");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/list?q=neko");
  });

  it("returns to the unfiltered bucket list on an empty query", async () => {
    setSearchParams({ filter: "paused", q: "neko" });
    renderBox();
    await submit("   ");

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/list?filter=paused");
  });
});
