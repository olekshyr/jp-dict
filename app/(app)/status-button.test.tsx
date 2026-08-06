import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { setStatus } from "@/app/actions/words";
import { toast } from "@/components/ui/toast";
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

  it("keeps the flipped label after the action settles", async () => {
    render(<StatusButton entryId={42} status="todo" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));
    });

    expect(
      screen.getByRole("button", { name: "Mark unlearned" }),
    ).toBeInTheDocument();
  });

  it("reverts and warns when the write fails", async () => {
    vi.mocked(setStatus).mockRejectedValueOnce(new Error("offline"));
    const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

    render(<StatusButton entryId={42} status="todo" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));
    });

    expect(
      screen.getByRole("button", { name: "Mark learned" }),
    ).toBeInTheDocument();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
});
