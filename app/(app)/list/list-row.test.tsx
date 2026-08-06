import {
  act,
  fireEvent,
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { removeWord, setStatus } from "@/app/actions/words";
import { ListFilterTabs } from "./list-filter-tabs";
import { useRow } from "../row-context";
import { ListRow } from "./list-row";
import { ListSession } from "./list-session";
import { SaveButton } from "../save-button";
import { StatusButton } from "../status-button";

/**
 * Stands in for the buttons a real row carries. Mirrors save-button.tsx /
 * status-button.tsx: the token from the forward call is captured and handed
 * back to `rollback`, so this stand-in exercises the same identity contract
 * the real buttons rely on rather than the pre-token no-arg `rollback()`.
 */
function RowControls({ label }: { label: string }) {
  const row = useRow();
  const token = useRef<symbol | undefined>(undefined);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          token.current = row?.unsave();
        }}
      >
        unsave {label}
      </button>
      <button
        type="button"
        onClick={() => {
          token.current = row?.setStatus("learned");
        }}
      >
        learn {label}
      </button>
      <button type="button" onClick={() => row?.rollback(token.current)}>
        undo {label}
      </button>
    </>
  );
}

/** Moves the row to an explicit bucket, for the learned-filter case. */
function RowControlsTo({ label, to }: { label: string; to: "todo" | "learned" }) {
  const row = useRow();
  return (
    <button type="button" onClick={() => row?.setStatus(to)}>
      move {label}
    </button>
  );
}

/**
 * Records every render of one row's content. Signaling through a callback
 * prop from a no-deps effect (rather than mutating a shared Map in the render
 * body) keeps this clear of the react-compiler immutability lint and fires
 * exactly once per real commit — a bailed-out subtree never runs the effect.
 */
function RenderCount({ onRender, id }: { onRender: (id: string) => void; id: string }) {
  useEffect(() => {
    onRender(id);
  });
  return <span>row {id}</span>;
}

type RenderSpy = ReturnType<typeof vi.fn<(id: string) => void>>;
type RowProps = Parameters<typeof ListRow>[0];

function renderCountOf(onRender: RenderSpy, id: string) {
  return onRender.mock.calls.filter(([renderedId]) => renderedId === id).length;
}

/**
 * Calls `ListRow`'s body directly — `ListRow(props)`, not `<ListRow/>` — so
 * its hooks run on *this* component's own fiber. That makes a re-execution
 * caused by anything `ListRow` subscribes to observable here: rendering
 * `<ListRow/>` as an element hides it, because React bails out of `children`
 * on identity, and neither a plain wrapper nor `<Profiler onRender>` can see
 * through that bailout (both were tried against this exact regression and
 * both missed it — a `ListRow` reading `useListCounts()` re-executes without
 * either external probe noticing).
 *
 * This relies on `ListRow` never being wrapped in `React.memo`, nor picked up
 * by a compiler auto-memoization pass that only instruments `<ListRow/>` /
 * `createElement(ListRow, ...)` call sites — calling it as a plain function
 * here would bypass memoization applied that way, and the test would
 * silently diverge from production with no lint or type error to catch it.
 * Neither applies today: `list-row.tsx` has no `memo()` and this repo has no
 * compiler-memoization plugin configured.
 */
function CountedRow({
  id,
  onRun,
  ...props
}: RowProps & { id: string; onRun: (id: string) => void }) {
  onRun(id);
  return ListRow(props);
}

function runCountOf(onRun: RenderSpy, id: string) {
  return onRun.mock.calls.filter(([ranId]) => ranId === id).length;
}

function list(onRender: RenderSpy, onRun: RenderSpy, filter: "todo" | "all" = "todo") {
  return (
    <ListSession counts={{ todo: 3, learned: 0 }}>
      <ListFilterTabs filter={filter} perPage={20} />
      {["a", "b", "c"].map((id) => (
        <CountedRow key={id} id={id} onRun={onRun} filter={filter} status="todo">
          <RenderCount onRender={onRender} id={id} />
          <RowControls label={id} />
        </CountedRow>
      ))}
    </ListSession>
  );
}

describe("ListRow", () => {
  it("removes only the unsaved row and ticks its bucket", async () => {
    const onRender: RenderSpy = vi.fn();
    const onRun: RenderSpy = vi.fn();
    render(list(onRender, onRun));

    fireEvent.click(screen.getByRole("button", { name: "unsave b" }));

    await waitForElementToBeRemoved(() => screen.queryByText("row b"));
    expect(screen.getByText("row a")).toBeInTheDocument();
    expect(screen.getByText("To learn").textContent).toContain("2");
  });

  it("does not re-render the other rows", () => {
    const onRender: RenderSpy = vi.fn();
    const onRun: RenderSpy = vi.fn();
    render(list(onRender, onRun));
    expect(renderCountOf(onRender, "a")).toBe(1);
    expect(runCountOf(onRun, "a")).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "unsave b" }));

    // `children` is the same element object across a row's own re-render, and
    // rows read only the identity-stable dispatch, so nothing else re-renders.
    expect(renderCountOf(onRender, "a")).toBe(1);
    expect(renderCountOf(onRender, "c")).toBe(1);
    // `runCountOf` is what actually catches `ListRow` re-executing for the
    // wrong reason: `CountedRow` calls `ListRow`'s body directly, so its hook
    // subscriptions run on this fiber and a stray re-render is visible here
    // even though the children-level assertions above cannot see it.
    expect(runCountOf(onRun, "a")).toBe(1);
    expect(runCountOf(onRun, "c")).toBe(1);
  });

  it("keeps a row that still matches the filter and only moves the counts", () => {
    const onRender: RenderSpy = vi.fn();
    const onRun: RenderSpy = vi.fn();
    render(list(onRender, onRun, "all"));

    fireEvent.click(screen.getByRole("button", { name: "learn a" }));

    expect(screen.getByText("row a")).toBeInTheDocument();
    expect(screen.getByText("To learn").textContent).toContain("2");
    expect(screen.getByText("Learned").textContent).toContain("1");
  });

  it("removes a row that leaves the learned filter", async () => {
    render(
      <ListSession counts={{ todo: 0, learned: 2 }}>
        <ListFilterTabs filter="learned" perPage={20} />
        <ListRow filter="learned" status="learned">
          <span>row d</span>
          <RowControlsTo label="d" to="todo" />
        </ListRow>
      </ListSession>,
    );

    fireEvent.click(screen.getByRole("button", { name: "move d" }));

    await waitForElementToBeRemoved(() => screen.queryByText("row d"));
    expect(screen.getByText("Learned").textContent).toContain("1");
    expect(screen.getByText("To learn").textContent).toContain("1");
  });

  it("restores the row and the counts on rollback", () => {
    const onRender: RenderSpy = vi.fn();
    const onRun: RenderSpy = vi.fn();
    render(list(onRender, onRun, "all"));

    fireEvent.click(screen.getByRole("button", { name: "learn a" }));
    fireEvent.click(screen.getByRole("button", { name: "undo a" }));

    expect(screen.getByText("To learn").textContent).toContain("3");
    expect(screen.getByText("Learned").textContent).toContain("0");
  });

  /*
   * The two tests below exercise the real buttons, not the `RowControls`
   * stand-in — the wiring under test is `row?.setStatus(next)` /
   * `row?.unsave()` / `row?.rollback()` inside save-button.tsx and
   * status-button.tsx themselves, which nothing above this point calls.
   *
   * The subtlety they rely on: a failing write flips `removed` to `true` (via
   * `setRemoved(true)`) before the action settles, which starts `ListRow`'s
   * exit animation — but `AnimatePresence` keeps the button mounted for the
   * duration of that exit rather than tearing it down, so its pending promise
   * is awaited by a still-live component, not an unmounted one. Confirmed by
   * instrumenting a mount-tracking child during this exact sequence: zero
   * unmounts. `row.rollback()` then flips `removed` back to `false` before
   * the 150ms exit ever completes, which cancels the animation in place
   * rather than swapping in a fresh instance — so the button reappearing
   * correctly labelled comes entirely from its own `catch` resetting its
   * local state (`setCurrent`/`setIsSaved`), not from remounting and reseeding
   * off its original prop as an older, pre-animation version of this comment
   * claimed (`ListRow` used to `return null` while removed, which did tear
   * the subtree down).
   *
   * A synchronous `getByRole` right after `act()` does NOT prove any of this:
   * `motion.div`'s own `transition` prop always wins over a `MotionConfig`
   * default wrapped around the tree (verified empirically with a standalone
   * AnimatePresence probe — wrapping in `<MotionConfig transition={{duration:
   * 0}}>` left the real 150ms exit timing completely unchanged), so the
   * button is "present" at this instant regardless of whether rollback ran —
   * a still-exiting node and a genuinely-restored one look identical to a
   * same-tick assertion. What actually discriminates them is *whether the
   * exit ever completes at all*: with a correct rollback the row is never
   * actually removed from the DOM (0 unmounts, confirmed above), so
   * `waitForElementToBeRemoved` on it must time out; with `rollback()`
   * mutated to skip `setRemoved(false)`, `removed` never reverts, the exit
   * runs to completion for real, and the same call resolves in ~150-220ms
   * instead. `rejects.toThrow()` on a bounded `waitForElementToBeRemoved` is
   * therefore the actual assertion under test below, not the `getByRole`
   * calls that follow it (those exist for readability/parity with the other
   * tests, but are no longer load-bearing on their own).
   * Mutation-tested by hand for this review round (rollback() edited to skip
   * `setRemoved(false)`, both tests re-run, restored afterward) — see the fix
   * report for the pass-with-broken-rollback numbers this replaced.
   */
  it("restores a removed row and its counts when the status write fails", async () => {
    vi.mocked(setStatus).mockRejectedValueOnce(new Error("offline"));
    render(
      <ListSession counts={{ todo: 3, learned: 0 }}>
        <ListFilterTabs filter="todo" perPage={20} />
        <ListRow filter="todo" status="todo">
          <StatusButton entryId={1} status="todo" />
        </ListRow>
      </ListSession>,
    );

    // Under `?filter=todo`, moving to "learned" takes the row off this page
    // immediately — the same optimistic removal `ListRow.setStatus` performs
    // on the real /list route.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));
    });

    // 400ms comfortably clears the real ~150-220ms it takes a *genuinely*
    // abandoned exit to finish (measured directly), while still being far
    // short of a flaky wait — a correctly-rolled-back row never starts
    // finishing at all, so this does not race a clock, it waits out a timeout
    // that a passing run is guaranteed to hit.
    await expect(
      waitForElementToBeRemoved(
        () => screen.queryByRole("button", { name: "Mark learned" }),
        { timeout: 400 },
      ),
    ).rejects.toThrow();

    expect(screen.getByRole("button", { name: "Mark learned" })).toBeInTheDocument();
    expect(screen.getByText("To learn").textContent).toContain("3");
    expect(screen.getByText("Learned").textContent).toContain("0");
  });

  it("restores an unsaved row and its counts when the save write fails", async () => {
    vi.mocked(removeWord).mockRejectedValueOnce(new Error("offline"));
    render(
      <ListSession counts={{ todo: 3, learned: 0 }}>
        <ListFilterTabs filter="todo" perPage={20} />
        <ListRow filter="todo" status="todo">
          <SaveButton entryId={1} saved />
        </ListRow>
      </ListSession>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    });

    await expect(
      waitForElementToBeRemoved(
        () => screen.queryByRole("button", { name: "Saved" }),
        { timeout: 400 },
      ),
    ).rejects.toThrow();

    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(screen.getByText("To learn").textContent).toContain("3");
  });

  /*
   * The two rejecting tests above only prove rollback works — with no
   * dispatch and no removal to undo, a deleted `row?.setStatus(next)` /
   * `row?.unsave()` call site is invisible to them (see the block comment
   * above). These are the forward-wiring mirror: a resolving write, so the
   * row must actually leave the page and the badge must actually move. Each
   * fails immediately, not after a 400ms timeout, if the wiring is removed.
   */
  it("removes the row from the page when the status write succeeds", async () => {
    render(
      <ListSession counts={{ todo: 3, learned: 0 }}>
        <ListFilterTabs filter="todo" perPage={20} />
        <ListRow filter="todo" status="todo">
          <StatusButton entryId={1} status="todo" />
        </ListRow>
      </ListSession>,
    );

    // Not wrapped in `act`: the resolving write settles almost immediately,
    // and awaiting it here would let the exit animation race ahead of the
    // check below — `waitForElementToBeRemoved` needs the element to still be
    // present at the moment it starts watching, same as the sibling test
    // above ("removes only the unsaved row and ticks its bucket").
    //
    // Queried by "Mark unlearned", not "Mark learned": the click relabels the
    // button synchronously (`setCurrent(next)` in status-button.tsx, before
    // the write even goes out), so "Mark learned" is already gone by the
    // first check regardless of removal — that would assert the relabel, not
    // the wiring under test.
    fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));

    await waitForElementToBeRemoved(() =>
      screen.queryByRole("button", { name: "Mark unlearned" }),
    );
    expect(screen.getByText("To learn").textContent).toContain("2");
  });

  it("removes the row from the page when the save write succeeds", async () => {
    render(
      <ListSession counts={{ todo: 3, learned: 0 }}>
        <ListFilterTabs filter="todo" perPage={20} />
        <ListRow filter="todo" status="todo">
          <SaveButton entryId={1} saved />
        </ListRow>
      </ListSession>,
    );

    // See the status-write test above for why this is unwrapped, and for
    // "Save" rather than "Saved": save-button.tsx flips the label
    // synchronously on click too.
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));

    await waitForElementToBeRemoved(() =>
      screen.queryByRole("button", { name: "Save" }),
    );
    expect(screen.getByText("To learn").textContent).toContain("2");
  });

  /*
   * Fix 1 regression: the two buttons in a row are separate components, so
   * both can have a write in flight at once. Before the token fix, a single
   * `undo` ref meant whichever write's rollback ran last would undo whatever
   * was sitting in that slot — even a different button's already-applied
   * write, not its own.
   */
  it("does not let a failed write roll back a different write that landed after it", async () => {
    let rejectSetStatus!: (error: Error) => void;
    vi.mocked(setStatus).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSetStatus = reject;
        }),
    );

    render(
      <ListSession counts={{ todo: 3, learned: 0 }}>
        <ListFilterTabs filter="all" perPage={20} />
        <ListRow filter="all" status="todo">
          <StatusButton entryId={1} status="todo" />
          <SaveButton entryId={1} saved />
        </ListRow>
      </ListSession>,
    );

    // 1. Mark learned. Under `filter=all` the row stays put; `setStatus` is
    // deliberately left unsettled, so it is still in flight below.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));
    });

    // 2. Before it settles, unsave — the second write to this row, which
    // (pre-fix) overwrites the row's single undo slot.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    });

    // 3. Now the first write rejects. Its rollback must be a no-op: by the
    // time it runs, the undo slot belongs to the unsave, not to this write.
    await act(async () => {
      rejectSetStatus(new Error("offline"));
    });

    // The unsave stands: the row keeps leaving the page rather than
    // reappearing with a stale "learned" badge and a "Save" button
    // mid-removal.
    await waitForElementToBeRemoved(() =>
      screen.queryByRole("button", { name: "Mark learned" }),
    );
    expect(screen.getByText("To learn").textContent).toContain("2");
    expect(screen.getByText("Learned").textContent).toContain("0");
  });
});
