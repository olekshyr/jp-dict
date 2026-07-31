import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setStatus } from "@/app/actions/words";
import type { Card } from "@/lib/user-words/queries";
import { Flashcards } from "./flashcards";

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
    render(<Flashcards cards={[]} initialMode="kanji" />);

    expect(screen.getByText("Session complete")).toBeInTheDocument();
    // Base UI's Button keeps role="button" even rendered as an anchor, so this
    // is queried by text rather than by the link role.
    expect(screen.getByText("Back to my list")).toHaveAttribute("href", "/list");
  });

  describe("front side", () => {
    it("shows the headword in kanji mode", () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      expect(screen.getByText("一")).toBeInTheDocument();
    });

    it("shows romaji in romaji mode", () => {
      render(<Flashcards cards={deck} initialMode="romaji" />);

      expect(screen.getByText("romaji-1")).toBeInTheDocument();
    });

    it("shows the glosses in english mode", () => {
      render(<Flashcards cards={deck} initialMode="english" />);

      expect(screen.getByText("gloss-1")).toBeInTheDocument();
    });

    it("annotates the headword in furigana mode", () => {
      const { container } = render(
        <Flashcards cards={deck} initialMode="furigana" />,
      );

      expect(container.querySelector("rt")).toHaveTextContent("よみ");
    });
  });

  describe("flipping", () => {
    it("swaps to the back and relabels the card", () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      expect(screen.getByText(/Tap to reveal/)).toBeInTheDocument();
      flip();

      expect(screen.getByText("gloss-1")).toBeInTheDocument();
      expect(screen.getByText(/Tap to hide/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Show front" }),
      ).toBeInTheDocument();
    });

    it("shows the headword on the back in english mode, since the front had the gloss", () => {
      render(<Flashcards cards={deck} initialMode="english" />);
      flip();

      expect(screen.getByText("一")).toBeInTheDocument();
    });
  });

  describe("skipping", () => {
    it("advances without touching the deck", async () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      await press("Skip");
      expect(screen.getByText("二")).toBeInTheDocument();
      expect(screen.getByText(/3 left/)).toBeInTheDocument();
      expect(setStatus).not.toHaveBeenCalled();
    });

    it("wraps back to the first card past the end", async () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      await press("Skip");
      await press("Skip");
      await press("Skip");

      expect(screen.getByText("一")).toBeInTheDocument();
    });

    it("hides the answer again after advancing", async () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      flip();
      await press("Skip");

      expect(screen.getByText(/Tap to reveal/)).toBeInTheDocument();
    });
  });

  describe('"I know this"', () => {
    it("marks the card learned and drops it from the session", async () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      await press("I know this");

      expect(setStatus).toHaveBeenCalledExactlyOnceWith(1, "learned");
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
    });

    it("holds the index so the next card slides into place", async () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      // Removing card 1 shifts card 2 into index 0 — advancing as well would
      // skip straight past it.
      await press("I know this");
      expect(screen.getByText("二")).toBeInTheDocument();
    });

    it("wraps to the start when the card removed was the last one", async () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      await press("Skip");
      await press("Skip");
      expect(screen.getByText("三")).toBeInTheDocument();

      await press("I know this");
      expect(screen.getByText("一")).toBeInTheDocument();
      expect(screen.getByText(/2 left/)).toBeInTheDocument();
    });

    it("ends the session once the last card is learned", async () => {
      render(<Flashcards cards={[card(1, "一")]} initialMode="kanji" />);

      await press("I know this");

      expect(screen.getByText("Session complete")).toBeInTheDocument();
    });
  });
});
