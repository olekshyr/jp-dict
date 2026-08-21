import { act, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { describe, expect, it, vi } from "vitest";

import { gradeCard, setFrontMode } from "@/app/actions/words";
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
  previews: { again: "1d", hard: "2d", good: "3d", easy: "8d" },
});

const deck = [card(1, "一"), card(2, "二"), card(3, "三")];

/** Clicks the card itself, which is a flip toggle in both directions. */
const flipCard = () =>
  fireEvent.click(
    screen.getByRole("button", { name: /Flip to the answer|Flip back to the front/ }),
  );

/** The button under the card, which only reveals. */
const flip = () => fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));

/*
 * Grade buttons carry their interval inside the accessible name ("Good 3d"),
 * so these match on the leading label rather than the whole string.
 */
const button = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}`) });

/** Flips the card, then answers it — a grade is unreachable before the flip. */
const grade = async (label: string) => {
  flip();
  await act(async () => {
    fireEvent.click(button(label));
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

      expect(
        screen.getByRole("button", { name: "Flip to the answer" }),
      ).toBeInTheDocument();
      flip();

      expect(screen.getByText("gloss-1")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Flip back to the front" }),
      ).toBeInTheDocument();
    });

    it("flips from the card itself as well as the button", () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      flipCard();
      expect(screen.getByText("gloss-1")).toBeInTheDocument();

      // The card toggles back; the button below it only ever reveals.
      flipCard();
      expect(screen.queryByText("gloss-1")).not.toBeInTheDocument();
    });

    it("shows the headword on the back in english mode, since the front had the gloss", () => {
      renderFlashcards({ cards: deck, initialMode: "english" });
      flip();

      expect(screen.getByText("一")).toBeInTheDocument();
    });
  });

  describe("grading", () => {
    /*
     * Rating a word you have not tried to recall is not a review — FSRS reads
     * the answer as evidence about memory, so an accidental click on an
     * unflipped card would poison the schedule rather than just skip a beat.
     */
    it("offers the reveal instead of the grades until the card is flipped", () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      // Not merely disabled: a row of dead buttons is the thing this replaced.
      for (const label of ["Again", "Hard", "Good", "Easy"]) {
        expect(
          screen.queryByRole("button", { name: new RegExp(`^${label}`) }),
        ).not.toBeInTheDocument();
      }
      expect(
        screen.getByRole("button", { name: "Reveal answer" }),
      ).toBeInTheDocument();

      flip();

      for (const label of ["Again", "Hard", "Good", "Easy"]) {
        expect(button(label)).toBeEnabled();
      }
      expect(
        screen.queryByRole("button", { name: "Reveal answer" }),
      ).not.toBeInTheDocument();
    });

    it("shows what each grade would schedule, once the answer is up", () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      expect(screen.queryByText("3d")).not.toBeInTheDocument();
      flip();

      expect(button("Again")).toHaveTextContent("1d");
      expect(button("Hard")).toHaveTextContent("2d");
      expect(button("Good")).toHaveTextContent("3d");
      expect(button("Easy")).toHaveTextContent("8d");
    });

    it("records the answer and drops the card from the session", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await grade("Good");

      expect(gradeCard).toHaveBeenCalledExactlyOnceWith(1, "good");
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
    });

    it("passes the grade the button stands for", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await grade("Easy");

      expect(gradeCard).toHaveBeenCalledExactlyOnceWith(1, "easy");
    });

    // The whole point of the optimistic layer. Scheduling these updates inside
    // the async `startTransition` instead makes them part of the Action, and
    // React withholds them until it settles — the card then sits on screen for
    // the entire write round-trip, which is what this guards against.
    it("drops the card on click, without waiting for the write", async () => {
      let settle!: (value: null) => void;
      vi.mocked(gradeCard).mockReturnValueOnce(
        new Promise((resolve) => {
          settle = resolve;
        }),
      );

      renderFlashcards({ cards: deck, initialMode: "kanji" });
      flip();
      await act(async () => {
        fireEvent.click(button("Good"));
      });

      expect(screen.getByText(/2 left/)).toBeInTheDocument();
      await act(async () => settle(null));
    });

    it("brings the next card up in its place", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await grade("Good");

      expect(await screen.findByText("二")).toBeInTheDocument();
    });

    it("hides the answer again for the next card", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await grade("Good");

      expect(
        await screen.findByRole("button", { name: "Reveal answer" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^Good/ }),
      ).not.toBeInTheDocument();
    });

    it("ignores a refilled deck handed back by the server", async () => {
      const { rerender } = renderFlashcards({ cards: deck, initialMode: "kanji" });

      await grade("Good");
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
      expect(await screen.findByText("二")).toBeInTheDocument();

      // getReviewCards selects afresh on every call, so a re-render can hand
      // back a deck that still contains words this session already answered.
      // Adopting it would silently reset the count.
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

    it("ends the session once the last card is answered", async () => {
      renderFlashcards({ cards: [card(1, "一")], initialMode: "kanji" });

      await grade("Good");

      expect(screen.getByText("Session complete")).toBeInTheDocument();
    });

    it("puts the card back and warns when the write fails", async () => {
      vi.mocked(gradeCard).mockRejectedValueOnce(new Error("offline"));
      const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

      renderFlashcards({ cards: deck, initialMode: "kanji" });
      await grade("Good");

      // A silently dropped card is a word the user believes they answered and
      // the database has never heard of.
      expect(screen.getByText(/3 left/)).toBeInTheDocument();
      expect(screen.getByText("一")).toBeInTheDocument();
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
    });

    it("puts a rolled-back card at the head, not wherever it was", async () => {
      vi.mocked(gradeCard).mockRejectedValueOnce(new Error("offline"));
      vi.spyOn(toast, "add").mockReturnValue("toast-id");

      renderFlashcards({ cards: deck, initialMode: "kanji" });
      await grade("Again");

      expect(screen.getByText(/3 left/)).toBeInTheDocument();
      expect(await screen.findByText("一")).toBeInTheDocument();
    });
  });

  /*
   * "Again" is an answer like any other: it records a lapse and moves due_at to
   * tomorrow, so the card leaves the deck and the counter agrees with what a
   * refresh would hand back. Seeing a word again this session is "later".
   */
  describe("again", () => {
    it("drops the card like every other grade", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      await grade("Again");

      expect(gradeCard).toHaveBeenCalledExactlyOnceWith(1, "again");
      expect(await screen.findByText("二")).toBeInTheDocument();
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
    });

    it("does not bring the word back later in the session", async () => {
      renderFlashcards({
        cards: [card(1, "一"), card(2, "二")],
        initialMode: "kanji",
      });

      await grade("Again");
      expect(await screen.findByText("二")).toBeInTheDocument();

      await grade("Good");

      expect(screen.getByText("Session complete")).toBeInTheDocument();
    });

    it("ends the session when it is the last card", async () => {
      renderFlashcards({ cards: [card(1, "一")], initialMode: "kanji" });

      await grade("Again");

      expect(screen.getByText("Session complete")).toBeInTheDocument();
    });
  });

  describe("later", () => {
    // The user put Later in the grade row, so it shares the row's flip gate.
    const later = () => screen.getByRole("button", { name: "Later" });
    const defer = () => {
      flip();
      fireEvent.click(later());
    };

    it("defers without telling the scheduler anything", () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      defer();

      expect(gradeCard).not.toHaveBeenCalled();
    });

    it("sends the card to the back without moving the counter", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      defer();

      expect(await screen.findByText("二")).toBeInTheDocument();
      // Nothing was written, so the word is still due and still owed an answer.
      expect(screen.getByText(/3 left/)).toBeInTheDocument();
    });

    it("hides the answer again for the next card", async () => {
      renderFlashcards({ cards: deck, initialMode: "kanji" });

      defer();

      expect(
        await screen.findByRole("button", { name: "Reveal answer" }),
      ).toBeInTheDocument();
    });

    it("comes back round after the rest of the deck", async () => {
      renderFlashcards({
        cards: [card(1, "一"), card(2, "二")],
        initialMode: "kanji",
      });

      defer();
      expect(await screen.findByText("二")).toBeInTheDocument();

      await grade("Good");
      expect(await screen.findByText("一")).toBeInTheDocument();
      expect(screen.getByText(/1 left/)).toBeInTheDocument();
    });

    // Rotating a one-card deck reproduces the same card, so an enabled button
    // here would be a dead click rather than a deferral.
    it("is disabled when there is nothing to defer past", () => {
      renderFlashcards({ cards: [card(1, "一")], initialMode: "kanji" });
      flip();

      expect(later()).toBeDisabled();
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
