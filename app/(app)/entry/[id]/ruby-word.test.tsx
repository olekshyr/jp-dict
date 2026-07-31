import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RubyWord } from "./ruby-word";

describe("RubyWord", () => {
  it.each([[null], [[]]])(
    "falls back to a plain span when there are no segments (%o)",
    (segments) => {
      const { container } = render(
        <RubyWord segments={segments} fallback="ねこ" className="text-2xl" />,
      );

      const span = container.querySelector("span");
      expect(span).toHaveTextContent("ねこ");
      expect(span).toHaveClass("text-2xl");
      expect(container.querySelector("ruby")).toBeNull();
    },
  );

  it("renders one ruby annotation per segment", () => {
    const { container } = render(
      <RubyWord
        segments={[
          { ruby: "食", rt: "た" },
          { ruby: "べ", rt: "" },
          { ruby: "物", rt: "もの" },
        ]}
        fallback="食べ物"
      />,
    );

    expect(container.querySelectorAll("rt")).toHaveLength(3);
    expect(screen.getByText("た")).toBeInTheDocument();
    expect(screen.getByText("もの")).toBeInTheDocument();
    // Kana segments carry no reading of their own — an empty <rt>, not a gap.
    expect(container.querySelectorAll("rt")[1]).toBeEmptyDOMElement();
  });

  it("survives a segment with no rt at all", () => {
    const { container } = render(
      <RubyWord
        segments={[{ ruby: "ね" } as { ruby: string; rt: string }]}
        fallback="ね"
      />,
    );

    expect(container.querySelector("rt")).toBeEmptyDOMElement();
  });
});
