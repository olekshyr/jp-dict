import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setStatus } from "@/app/actions/words";
import { StatusButton } from "./status-button";

describe("StatusButton", () => {
  it("offers to mark a todo word learned", () => {
    render(<StatusButton entryId={7} status="todo" />);

    expect(
      screen.getByRole("button", { name: "Mark learned" }),
    ).toBeInTheDocument();
  });

  it("offers to unlearn a learned word", () => {
    render(<StatusButton entryId={7} status="learned" />);

    expect(
      screen.getByRole("button", { name: "Mark unlearned" }),
    ).toBeInTheDocument();
  });

  it("moves a word into the learned bucket", async () => {
    render(<StatusButton entryId={7} status="todo" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));
    });

    expect(setStatus).toHaveBeenCalledExactlyOnceWith(7, "learned");
  });

  it("moves it back out again", async () => {
    render(<StatusButton entryId={7} status="learned" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark unlearned" }));
    });

    expect(setStatus).toHaveBeenCalledExactlyOnceWith(7, "todo");
  });
});
