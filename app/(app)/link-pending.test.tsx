import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setLinkPending } from "@/test/next-link";
import { LinkPending } from "./link-pending";
import { NavPendingProvider } from "./nav-pending";
import { PendingContent } from "./pending-content";

/**
 * The two halves of the affordance are tested together on purpose: the point of
 * <LinkPending> is not its own spinner but that a link's pending state reaches
 * content it does not contain, which is what `aria-busy` on <PendingContent>
 * stands in for here.
 */

function Harness({ links = 1 }: { links?: number }) {
  return (
    <NavPendingProvider>
      {Array.from({ length: links }, (_, i) => (
        <a key={i} href={`/list?page=${i}`}>
          page {i}
          <LinkPending />
        </a>
      ))}
      <PendingContent>
        <p>rows</p>
      </PendingContent>
    </NavPendingProvider>
  );
}

const busy = () => screen.getByText("rows").parentElement;

describe("LinkPending", () => {
  it("stays invisible and leaves content alone while idle", () => {
    const { container } = render(<Harness />);

    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(busy()).toHaveAttribute("aria-busy", "false");
  });

  it("spins and marks the content stale while its link is in flight", () => {
    setLinkPending(true);
    const { container } = render(<Harness />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(busy()).toHaveAttribute("aria-busy", "true");
  });

  it("clears the flag when the link unmounts mid-flight", () => {
    // The link that starts a navigation is usually replaced by the tree that
    // navigation produced. A stuck id would leave the app dimmed for good.
    setLinkPending(true);
    const { rerender } = render(<Harness />);
    expect(busy()).toHaveAttribute("aria-busy", "true");

    rerender(<Harness links={0} />);

    expect(busy()).toHaveAttribute("aria-busy", "false");
  });

  it("stays busy while a second link is still pending", () => {
    // Overlapping clicks: the set of ids is what stops the first link clearing
    // the flag on its way out while another navigation is still running.
    setLinkPending(true);
    const { rerender } = render(<Harness links={2} />);

    rerender(<Harness links={1} />);

    expect(busy()).toHaveAttribute("aria-busy", "true");
  });
});
