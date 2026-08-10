import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SaveButton } from "../../save-button";
import { SavedProvider } from "../../saved-context";
import { EntryNotePanel } from "./entry-note-panel";

describe("EntryNotePanel", () => {
  it("shows the note open, without being asked", () => {
    render(<EntryNotePanel entryId={7} saved note="ねこ = cat" />);

    expect(screen.getByRole("textbox", { name: "My note" })).toHaveValue(
      "ねこ = cat",
    );
  });

  it("renders nothing for a word that isn't saved", () => {
    render(<EntryNotePanel entryId={7} saved={false} note={null} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  /*
   * The point of the shared context. Saving is a client-side optimistic flip in
   * a component the note panel cannot see, and the action doesn't refresh the
   * route — so without the override the note area would stay missing until the
   * next navigation.
   */
  it("appears as soon as the word is saved, with no reload", () => {
    render(
      <SavedProvider>
        <SaveButton entryId={7} saved={false} />
        <EntryNotePanel entryId={7} saved={false} note={null} />
      </SavedProvider>,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("textbox", { name: "My note" })).toBeInTheDocument();
  });

  it("goes away again when the word is unsaved", () => {
    render(
      <SavedProvider>
        <SaveButton entryId={7} saved />
        <EntryNotePanel entryId={7} saved note="ねこ = cat" />
      </SavedProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Saved" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
