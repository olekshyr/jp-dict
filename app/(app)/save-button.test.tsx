import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { addWord, removeWord } from "@/app/actions/words";
import { SaveButton } from "./save-button";

/**
 * `useOptimistic` is seeded from the `saved` prop, so the optimistic label only
 * holds while the transition is in flight — the moment the action settles,
 * React snaps back to the prop (which, in the real app, has been re-rendered by
 * `refresh()` by then). Tests that want to observe the flip therefore have to
 * keep the action pending, hence the deferred below.
 */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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

  it("flips the label and disables itself while the action is in flight", async () => {
    const pending = deferred();
    vi.mocked(addWord).mockReturnValue(pending.promise);

    render(<SaveButton entryId={42} saved={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const button = await screen.findByRole("button", { name: "Saved" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toBeDisabled();

    await act(async () => {
      pending.resolve();
    });
  });
});
