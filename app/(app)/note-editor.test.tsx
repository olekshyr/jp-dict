import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { setNote } from "@/app/actions/words";
import { toast } from "@/components/ui/toast";
import { NoteEditor } from "./note-editor";

const field = () => screen.getByRole("textbox", { name: "My note" });

/** Types into the field and blurs it, which is the only way a note is saved. */
async function typeAndBlur(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  await act(async () => {
    fireEvent.blur(field());
  });
}

describe("NoteEditor", () => {
  it("shows the existing note", () => {
    render(<NoteEditor entryId={7} note="ねこ = cat" />);

    expect(field()).toHaveValue("ねこ = cat");
  });

  it("starts empty when there is no note", () => {
    render(<NoteEditor entryId={7} note={null} />);

    expect(field()).toHaveValue("");
  });

  it("saves the trimmed note on blur", async () => {
    render(<NoteEditor entryId={7} note={null} />);

    await typeAndBlur("  counter: 匹  ");

    expect(setNote).toHaveBeenCalledExactlyOnceWith(7, "counter: 匹");
  });

  it("writes nothing when the note is unchanged", async () => {
    render(<NoteEditor entryId={7} note="ねこ = cat" />);

    await act(async () => {
      fireEvent.blur(field());
    });

    expect(setNote).not.toHaveBeenCalled();
  });

  // Whitespace-only is the same as no note, and the action collapses it to
  // NULL — but it still has to be *sent*, or clearing a note would never stick.
  it("sends an empty string when the note is cleared", async () => {
    render(<NoteEditor entryId={7} note="ねこ = cat" />);

    await typeAndBlur("   ");

    expect(setNote).toHaveBeenCalledExactlyOnceWith(7, "");
  });

  it("does not write again when blurred a second time unchanged", async () => {
    render(<NoteEditor entryId={7} note={null} />);

    await typeAndBlur("counter: 匹");
    await act(async () => {
      fireEvent.blur(field());
    });

    expect(setNote).toHaveBeenCalledOnce();
  });

  it("reverts and warns when the write fails", async () => {
    vi.mocked(setNote).mockRejectedValueOnce(new Error("offline"));
    const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

    render(<NoteEditor entryId={7} note="ねこ = cat" />);
    await typeAndBlur("clobbered");

    expect(field()).toHaveValue("ねこ = cat");
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("tells its owner about a commit and about a rollback", async () => {
    vi.mocked(setNote).mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(toast, "add").mockReturnValue("toast-id");
    const onCommit = vi.fn();

    render(<NoteEditor entryId={7} note="before" onCommit={onCommit} />);
    await typeAndBlur("after");

    // Optimistic first, so the /list preview updates on the click rather than
    // on the round-trip; then back again when the round-trip rejects.
    expect(onCommit.mock.calls).toEqual([["after"], ["before"]]);
  });

  it("abandons the edit on Escape without writing", async () => {
    render(<NoteEditor entryId={7} note="ねこ = cat" />);

    fireEvent.change(field(), { target: { value: "half-typed" } });
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Escape" });
      // Escape blurs the field itself; jsdom's blur() only fires the event when
      // the element is actually focused, so the handler is invoked directly —
      // the point of the test is that the blur finds nothing to write.
      fireEvent.blur(field());
    });

    expect(field()).toHaveValue("ねこ = cat");
    expect(setNote).not.toHaveBeenCalled();
  });

  /*
   * React does not fire blur when it unmounts a focused element, so without the
   * cleanup flush, collapsing a /list row mid-edit would drop the note.
   */
  it("still saves a pending edit when it unmounts", async () => {
    const { unmount } = render(<NoteEditor entryId={7} note={null} />);

    fireEvent.change(field(), { target: { value: "counter: 匹" } });
    await act(async () => {
      unmount();
    });

    expect(setNote).toHaveBeenCalledExactlyOnceWith(7, "counter: 匹");
  });

  it("does not write on unmount when nothing changed", async () => {
    const { unmount } = render(<NoteEditor entryId={7} note="ねこ = cat" />);

    await act(async () => {
      unmount();
    });

    expect(setNote).not.toHaveBeenCalled();
  });

  it("confirms a save", async () => {
    render(<NoteEditor entryId={7} note={null} />);

    await typeAndBlur("counter: 匹");

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  // The note is user-authored text and reaches the page as a React text child,
  // never as HTML. This is the assertion that stops a future "render newlines
  // as <br>" change from turning it into stored XSS.
  it("renders markup in a note as literal text", () => {
    render(<NoteEditor entryId={7} note='<img src=x onerror="alert(1)">' />);

    expect(field()).toHaveValue('<img src=x onerror="alert(1)">');
    expect(document.querySelector("img")).toBeNull();
  });

  it("caps the field at the length the action enforces", () => {
    render(<NoteEditor entryId={7} note={null} />);

    expect(field()).toHaveAttribute("maxlength", "2000");
  });
});
