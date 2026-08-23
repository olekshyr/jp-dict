import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { NavPendingProvider } from "../nav-pending";
import { ListFilterTabs } from "./list-filter-tabs";
import { ListSession, useListDispatch } from "./list-session";

/** Dispatches a "paused one new word" delta on click. */
function MoveOne() {
  const dispatch = useListDispatch();
  return (
    <button type="button" onClick={() => dispatch({ new: -1, paused: 1 })}>
      move
    </button>
  );
}

/**
 * Calls back on every render so the test can prove it did not re-render.
 * Signaling through a callback prop (rather than mutating a shared counter
 * object) keeps this clear of the react-compiler immutability lint, and an
 * effect with no dependency array fires exactly once per commit — the same
 * signal.
 */
function DispatchProbe({ onRender }: { onRender: () => void }) {
  useListDispatch();
  useEffect(() => {
    onRender();
  });
  return null;
}

describe("ListSession", () => {
  it("renders server counts plus this session's deltas", () => {
    render(
      <ListSession counts={{ new: 3, learning: 0, mature: 0, paused: 1 }}>
        <NavPendingProvider>
          <ListFilterTabs filter="new" perPage={20} />
        </NavPendingProvider>
        <MoveOne />
      </ListSession>,
    );

    // Base UI's Button keeps role="button" on anchors, so the tabs are queried
    // by text rather than by the link role.
    expect(screen.getByText("New").textContent).toContain("3");

    fireEvent.click(screen.getByRole("button", { name: "move" }));

    expect(screen.getByText("New").textContent).toContain("2");
    expect(screen.getByText("Paused").textContent).toContain("2");
  });

  it("does not re-render dispatch-only consumers when the counts change", () => {
    const onRender = vi.fn();

    render(
      <ListSession counts={{ new: 3, learning: 0, mature: 0, paused: 1 }}>
        <NavPendingProvider>
          <ListFilterTabs filter="new" perPage={20} />
        </NavPendingProvider>
        <DispatchProbe onRender={onRender} />
        <MoveOne />
      </ListSession>,
    );
    expect(onRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "move" }));

    // `dispatch` is identity-stable, and `children` is the same element object
    // across ListSession's own re-render, so React bails out of this subtree.
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("drops pending deltas when the key changes", () => {
    const session = (key: string) => (
      <ListSession key={key} counts={{ new: 3, learning: 0, mature: 0, paused: 1 }}>
        <NavPendingProvider>
          <ListFilterTabs filter="new" perPage={20} />
        </NavPendingProvider>
        <MoveOne />
      </ListSession>
    );

    const { rerender } = render(session("new:1:20"));
    fireEvent.click(screen.getByRole("button", { name: "move" }));
    expect(screen.getByText("New").textContent).toContain("2");

    // This test keys `<ListSession>` itself, so what it actually pins is
    // React's key semantics — a changed key remounts and drops the reducer's
    // state — not that page.tsx supplies that key on the query that produced
    // `counts`. That wiring lives in app/(app)/list/page.tsx, an async Server
    // Component out of scope for Vitest per AGENTS.md; deleting `key={...}`
    // there would leave this test green.
    rerender(session("new:2:20"));

    expect(screen.getByText("New").textContent).toContain("3");
  });
});
