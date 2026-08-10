import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { addWord, removeWord } from "@/app/actions/words";
import { toast } from "@/components/ui/toast";
import { SaveButton } from "./save-button";
import { SavedProvider, useSaved } from "./saved-context";

/**
 * The `saved` prop is an initial value, not a live one: the button holds its own
 * state and the Server Action no longer re-renders the page, so the flipped
 * label sticks without a pending promise to hold it there.
 */
describe("SaveButton", () => {
  it("reads Save when the word is not saved", () => {
    render(<SaveButton entryId={42} saved={false} />);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("reads Saved when it is", () => {
    render(<SaveButton entryId={42} saved />);

    expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("saves an unsaved word", async () => {
    render(<SaveButton entryId={42} saved={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(addWord).toHaveBeenCalledExactlyOnceWith(42);
    expect(removeWord).not.toHaveBeenCalled();
  });

  it("unsaves a saved word", async () => {
    render(<SaveButton entryId={42} saved />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    });

    expect(removeWord).toHaveBeenCalledExactlyOnceWith(42);
    expect(addWord).not.toHaveBeenCalled();
  });

  it("keeps the flipped label after the action settles", async () => {
    render(<SaveButton entryId={42} saved={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    const button = screen.getByRole("button", { name: "Saved" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("reverts and warns when the write fails", async () => {
    vi.mocked(addWord).mockRejectedValueOnce(new Error("offline"));
    const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

    render(<SaveButton entryId={42} saved={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  /*
   * On /entry/[id] the note panel is a sibling that appears and vanishes with
   * this toggle, so the flip is published to <SavedProvider> as well as held
   * locally — and a failed write has to take both back. Everywhere else
   * `useSaved()` is null and none of this runs.
   */
  it("takes the shared saved state back when the write fails", async () => {
    vi.mocked(addWord).mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(toast, "add").mockReturnValue("toast-id");

    render(
      <SavedProvider>
        <SaveButton entryId={42} saved={false} />
        <Saved />
      </SavedProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(screen.getByTestId("shared")).toHaveTextContent("false");
  });
});

/** Reads back whatever the button published, so the test can assert on it. */
function Saved() {
  return <span data-testid="shared">{String(useSaved()?.saved)}</span>;
}
