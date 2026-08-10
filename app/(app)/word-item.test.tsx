import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WordItem } from "./word-item";

const base = {
  entryId: 1234,
  headword: "猫",
  reading: "ねこ",
  romaji: "neko",
  glossSummary: "cat",
};

describe("WordItem", () => {
  it("links the whole headword block at the entry", () => {
    render(<WordItem {...base} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/entry/1234");
  });

  it("shows the reading when it differs from the headword", () => {
    render(<WordItem {...base} />);

    expect(screen.getByText("猫")).toBeInTheDocument();
    expect(screen.getByText("ねこ")).toBeInTheDocument();
    expect(screen.getByText("neko")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("drops the reading when it is the same as the headword", () => {
    // Kana-only entries have reading === headword; printing it twice reads as
    // a mistake.
    render(<WordItem {...base} headword="ねこ" reading="ねこ" />);

    expect(screen.getAllByText("ねこ")).toHaveLength(1);
  });

  it("badges common words only", () => {
    const { rerender } = render(<WordItem {...base} />);
    expect(screen.queryByText("common")).not.toBeInTheDocument();

    rerender(<WordItem {...base} isCommon />);
    expect(screen.getByText("common")).toBeInTheDocument();
  });

  it("renders the actions passed as children", () => {
    render(
      <WordItem {...base}>
        <button type="button">Save</button>
      </WordItem>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders the footer outside the entry link", () => {
    // /list hangs the note here. Nesting it in the anchor would make every
    // click on the note navigate to the entry instead of opening the editor.
    render(<WordItem {...base} footer={<button type="button">Note</button>} />);

    const note = screen.getByRole("button", { name: "Note" });
    expect(note).toBeInTheDocument();
    expect(note.closest("a")).toBeNull();
  });
});
