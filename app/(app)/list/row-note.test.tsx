import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { setNote } from "@/app/actions/words";
import { toast } from "@/components/ui/toast";
import { RowNote } from "./row-note";

const toggle = () => screen.getByRole("button");
const field = () => screen.getByRole("textbox", { name: "My note" });

describe("RowNote", () => {
  it("previews an existing note", () => {
    render(<RowNote entryId={7} note="ねこ = cat" />);

    expect(toggle()).toHaveTextContent("ねこ = cat");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // The list shows notes; it doesn't solicit them. A row of "Add note"
  // affordances on a list where most words have none is noise, and the entry
  // page is where a first note gets written.
  it("renders nothing at all when there is no note", () => {
    const { container } = render(<RowNote entryId={7} note={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("opens the editor in place", () => {
    render(<RowNote entryId={7} note="ねこ = cat" />);

    fireEvent.click(toggle());

    expect(field()).toHaveValue("ねこ = cat");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes again", () => {
    render(<RowNote entryId={7} note="ねこ = cat" />);

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the new text in the preview after an edit", async () => {
    render(<RowNote entryId={7} note="ねこ = cat" />);

    fireEvent.click(toggle());
    fireEvent.change(field(), { target: { value: "counter: 匹" } });
    await act(async () => {
      fireEvent.blur(field());
    });
    fireEvent.click(toggle());

    expect(setNote).toHaveBeenCalledExactlyOnceWith(7, "counter: 匹");
    expect(toggle()).toHaveTextContent("counter: 匹");
  });

  it("keeps the field open while a cleared note is still being edited", async () => {
    render(<RowNote entryId={7} note="ねこ = cat" />);

    fireEvent.click(toggle());
    fireEvent.change(field(), { target: { value: "" } });
    await act(async () => {
      fireEvent.blur(field());
    });

    // Clearing must not yank the field out from under the cursor mid-edit.
    expect(field()).toBeInTheDocument();
  });

  it("goes quiet once a cleared note is collapsed", async () => {
    const { container } = render(<RowNote entryId={7} note="ねこ = cat" />);

    fireEvent.click(toggle());
    fireEvent.change(field(), { target: { value: "" } });
    await act(async () => {
      fireEvent.blur(field());
    });
    fireEvent.click(toggle());

    expect(setNote).toHaveBeenCalledExactlyOnceWith(7, "");
    expect(container).toBeEmptyDOMElement();
  });

  it("restores the previous preview when the write fails", async () => {
    vi.mocked(setNote).mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(toast, "add").mockReturnValue("toast-id");

    render(<RowNote entryId={7} note="ねこ = cat" />);
    fireEvent.click(toggle());
    fireEvent.change(field(), { target: { value: "clobbered" } });
    await act(async () => {
      fireEvent.blur(field());
    });
    fireEvent.click(toggle());

    expect(toggle()).toHaveTextContent("ねこ = cat");
  });

  // Collapsing unmounts the editor. Its cleanup flush is what keeps the edit,
  // since React fires no blur on the way out.
  it("saves an edit that is still in the field when the row collapses", async () => {
    render(<RowNote entryId={7} note="ねこ = cat" />);

    fireEvent.click(toggle());
    fireEvent.change(field(), { target: { value: "counter: 匹" } });
    await act(async () => {
      fireEvent.click(toggle());
    });

    expect(setNote).toHaveBeenCalledExactlyOnceWith(7, "counter: 匹");
    expect(toggle()).toHaveTextContent("counter: 匹");
  });

  it("renders markup in a note as literal text", () => {
    render(<RowNote entryId={7} note='<img src=x onerror="alert(1)">' />);

    expect(toggle()).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(document.querySelector("img")).toBeNull();
  });
});
