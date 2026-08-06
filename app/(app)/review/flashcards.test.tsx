import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { describe, expect, it, vi } from "vitest";

import { setFrontMode, setStatus } from "@/app/actions/words";
import type { Card } from "@/lib/user-words/queries";
import { toast } from "@/components/ui/toast";
import { Flashcards } from "./flashcards";

// The card swap is animated (see flashcards.tsx); zeroing the transition here
// keeps these tests about state, not about waiting out a 150ms cross-fade.
type FlashcardsProps = Parameters<typeof Flashcards>[0];

function renderFlashcards(props: FlashcardsProps) {
  return render(
    <MotionConfig transition={{ duration: 0 }}>
      <Flashcards {...props} />
    </MotionConfig>,
  );
}

const card = (entryId: number, headword: string): Card => ({
  entryId,
  headword,
  reading: `${headword}よみ`,
  romaji: `romaji-${entryId}`,
  glosses: `gloss-${entryId}`,
  ruby: [{ ruby: headword, rt: "よみ" }],
});

const deck = [card(1, "一"), card(2, "二"), card(3, "三")];

const flip = () =>
  fireEvent.click(screen.getByRole("button", { name: /Reveal answer|Show front/ }));

const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

describe("Flashcards", () => {
  it("shows the empty state when there is nothing left to review", () => {
    renderFlashcards({ cards: [], initialMode: "kanji" });

    expect(screen.getByText("Session complete")).toBeInTheDocument();
    // Base UI's Button keeps role="button" even rendered as an anchor, so this
    // is queried by text rather than by the link role.
    expect(screen.getByText("Back to my list")).toHaveAttribute("href", "/list");
  });

  describe("front side", () => {
    it("shows the headword in kanji mode", () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      expect(screen.getByText("一")).toBeInTheDocument();
    });

    it("shows romaji in romaji mode", () => {
      renderFlashcards({ cards: deck, initialMode: "romaji" });

      expect(screen.getByText("romaji-1")).toBeInTheDocument();
    });

    it("shows the glosses in english mode", () => {
      renderFlashcards({ cards: deck, initialMode: "english" });

      expect(screen.getByText("gloss-1")).toBeInTheDocument();
    });

    it("annotates the headword in furigana mode", () => {
      const { container } = renderFlashcards({
        cards: deck,
        initialMode: "furigana",
      });

      expect(container.querySelector("rt")).toHaveTextContent("よみ");
    });
  });

  describe("flipping", () => {
    it("swaps to the back and relabels the card", () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      expect(screen.getByText(/Tap to reveal/)).toBeInTheDocument();
      flip();

      expect(screen.getByText("gloss-1")).toBeInTheDocument();
      expect(screen.getByText(/Tap to hide/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Show front" }),
      ).toBeInTheDocument();
    });

    it("shows the headword on the back in english mode, since the front had the gloss", () => {
      renderFlashcards({ cards: deck, initialMode: "english" });
      flip();

      expect(screen.getByText("一")).toBeInTheDocument();
    });
  });

  describe("skipping", () => {
    it("advances without touching the deck", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await press("Skip");
      await waitFor(() => expect(screen.getByText("二")).toBeInTheDocument());
      expect(screen.getByText(/3 left/)).toBeInTheDocument();
      expect(setStatus).not.toHaveBeenCalled();
    });

    it("wraps back to the first card past the end", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await press("Skip");
      await press("Skip");
      await press("Skip");

      // Under `mode="wait"`, the wrapped-to card doesn't mount until the
      // outgoing one's exit settles — a synchronous assertion here could pass
      // on a stale, not-yet-transitioned DOM without the wraparound arithmetic
      // actually being exercised. Same pattern as the sibling "wraps to the
      // start" test below.
      expect(await screen.findByText("一")).toBeInTheDocument();
    });

    it("hides the answer again after advancing", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      flip();
      await press("Skip");

      expect(screen.getByText(/Tap to reveal/)).toBeInTheDocument();
    });
  });

  describe('"I know this"', () => {
    it("marks the card learned and drops it from the session", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await press("I know this");

      expect(setStatus).toHaveBeenCalledExactlyOnceWith(1, "learned");
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
    });

    it("holds the index so the next card slides into place", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      // Removing card 1 shifts card 2 into index 0 — advancing as well would
      // skip straight past it. The next card is a key change for
      // AnimatePresence, so its enter animation settles asynchronously.
      await press("I know this");
      expect(await screen.findByText("二")).toBeInTheDocument();
    });

    it("wraps to the start when the card removed was the last one", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await press("Skip");
      await press("Skip");
      expect(await screen.findByText("三")).toBeInTheDocument();

      await press("I know this");
      expect(await screen.findByText("一")).toBeInTheDocument();
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
    });

    it("ignores a refilled deck handed back by the server", async () => {
      const { rerender } = renderFlashcards({ cards: deck, initialMode: "kanji" });

      await press("I know this");
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
      expect(await screen.findByText("二")).toBeInTheDocument();

      // getReviewCards refills to its limit and re-randomises on every call, so
      // a re-render can hand back a different deck of the same size. The
      // session must ignore it — otherwise the count silently resets.
      rerender(
        <MotionConfig transition={{ duration: 0 }}>
          <Flashcards
            cards={[card(7, "七"), card(2, "二"), card(9, "九")]}
            initialMode="kanji"
          />
        </MotionConfig>,
      );

      expect(screen.getByText(/2 left/)).toBeInTheDocument();
      expect(screen.getByText("二")).toBeInTheDocument();
    });

    it("ends the session once the last card is learned", async () => {
      renderFlashcards({ cards: [card(1, "一")], initialMode: "kanji" });

      await press("I know this");

      expect(screen.getByText("Session complete")).toBeInTheDocument();
    });

    it("puts the card back and warns when the write fails", async () => {
      vi.mocked(setStatus).mockRejectedValueOnce(new Error("offline"));
      const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

      renderFlashcards({ cards: deck, initialMode: "kanji" });
      await press("I know this");

      // A silently dropped card is a word the user believes they have learned
      // and the database does not.
      expect(screen.getByText(/3 left/)).toBeInTheDocument();
      expect(screen.getByText("一")).toBeInTheDocument();
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
    });

    it("restores the index when rolling back the last card", async () => {
      vi.mocked(setStatus).mockRejectedValueOnce(new Error("offline"));
      vi.spyOn(toast, "add").mockReturnValue("toast-id");

      renderFlashcards({ cards: deck, initialMode: "kanji" });
      // Skip twice to land on the last card (三).
      await press("Skip");
      await press("Skip");
      expect(await screen.findByText("三")).toBeInTheDocument();

      await press("I know this");

      // When the write fails, the card returns to index 2, not wrapping to index 0.
      // Losing setIndex(at) from the rollback path makes this fail, keeping the
      // index at 0 and showing 一 instead.
      expect(screen.getByText(/3 left/)).toBeInTheDocument();
      expect(await screen.findByText("三")).toBeInTheDocument();
    });
  });

  describe("front mode", () => {
    it("keeps the new front when the preference saves", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await act(async () => {
        fireEvent.click(screen.getByRole("tab", { name: "Romaji" }));
      });

      expect(setFrontMode).toHaveBeenCalledExactlyOnceWith("romaji");
      expect(screen.getByText("romaji-1")).toBeInTheDocument();
    });

    it("reverts the front when the preference fails to save", async () => {
      vi.mocked(setFrontMode).mockRejectedValueOnce(new Error("offline"));
      const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

      renderFlashcards({ cards: deck, initialMode: "kanji" });
      await act(async () => {
        fireEvent.click(screen.getByRole("tab", { name: "Romaji" }));
      });

      expect(screen.getByText("一")).toBeInTheDocument();
      expect(screen.queryByText("romaji-1")).not.toBeInTheDocument();
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
    });
  });
});
