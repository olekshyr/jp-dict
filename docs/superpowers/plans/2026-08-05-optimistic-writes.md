# Optimistic Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every mutating click in the signed-in app update instantly from local state and write to the database in the background, and make a review session a fixed deck that actually counts down.

**Architecture:** `refresh()` comes out of all four Server Actions, so a write no longer re-renders the route. `Flashcards` seeds its deck from the server once and owns it thereafter. `/list` grows a small optimistic layer where each row owns its own removal and writes count deltas to a session provider, so removing one row re-renders that row and the tab strip and nothing else. Failed writes roll back and raise an error toast.

**Tech Stack:** Next 16.2.12 (App Router, `cacheComponents`), React 19.2.4, Base UI 1.6.0 (incl. its Toast), motion 12, Vitest + Testing Library, pnpm.

**Spec:** [2026-08-04-optimistic-writes-design.md](../specs/2026-08-04-optimistic-writes-design.md)

## Global Constraints

- **Never run `git commit`.** The user commits manually. Each task ends with a suggested message — print it, do not run it.
- Verify with `pnpm lint && pnpm typecheck && pnpm test` before calling any task done. All three must pass.
- One component per file, kebab-case named after the component (`ListRow` → `list-row.tsx`).
- Route-specific components stay colocated under `app/(app)/…`; only reusable primitives go in `components/ui/`.
- Comments explain **why**, not what. Match the existing density — this codebase's comments carry reasoning about non-obvious choices.
- No new dependencies. `motion` and `@base-ui/react` are already installed.
- Tests are colocated as `*.test.tsx` next to what they cover. Add cases to the existing test file for a component; never create a second test file beside it.
- `coverage.include` in `vitest.config.mts` is already `app/**` — new files under `app/(app)/list/` need no config change.
- React 19 context syntax: `<SomeContext value={…}>`, not `<SomeContext.Provider>`.
- Tests import `describe`/`it`/`expect`/`vi` from `"vitest"` explicitly — `globals` is off.

---

### Task 1: `Flashcards` owns its deck

Fixes the reported bug on its own: the counter stops resetting even while `refresh()` is still in place, because a snapshot deck cannot be reshuffled from outside.

**Files:**
- Modify: `app/(app)/review/flashcards.tsx:86-178`
- Test: `app/(app)/review/flashcards.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Flashcards` keeps its existing props — `{ cards: Card[]; initialMode: FrontMode }`. `cards` becomes seed-only. Later tasks add rollback and front-mode changes to this same component.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('"I know this"')` block in `app/(app)/review/flashcards.test.tsx`:

```tsx
    it("ignores a refilled deck handed back by the server", async () => {
      const { rerender } = render(
        <Flashcards cards={deck} initialMode="kanji" />,
      );

      await press("I know this");
      expect(screen.getByText(/2 left/)).toBeInTheDocument();

      // getReviewCards refills to its limit and re-randomises on every call, so
      // a re-render can hand back a different deck of the same size. The
      // session must ignore it — otherwise the count silently resets.
      rerender(
        <Flashcards
          cards={[card(7, "七"), card(2, "二"), card(9, "九")]}
          initialMode="kanji"
        />,
      );

      expect(screen.getByText(/2 left/)).toBeInTheDocument();
      expect(screen.getByText("二")).toBeInTheDocument();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- flashcards`
Expected: FAIL — `Unable to find an element with the text: /2 left/`. The rendered counter reads "3 left", because `remaining` filters the new deck and finds nothing to drop.

- [ ] **Step 3: Replace the derived `remaining` with owned deck state**

In `app/(app)/review/flashcards.tsx`, inside `Flashcards`, delete the `done` state and the `remaining` const and put in their place:

```tsx
  // The deck IS the session. Seeded from the server once and deliberately never
  // re-synced: getReviewCards refills to its limit and re-randomises on every
  // call, so adopting a later `cards` would swap the deck out from under the
  // count — which is exactly the bug this replaced.
  const [deck, setDeck] = useState(cards);

  const card = deck[index];
```

Update `advance` to wrap against the deck:

```tsx
  /** Move to the next card, wrapping past the end. */
  function advance() {
    setFlipped(false);
    setIndex((i) => (i + 1) % deck.length);
  }
```

Replace the "I know this" handler body:

```tsx
          onClick={() => {
            const id = card.entryId;
            startTransition(async () => {
              // Dropping this card shifts the next one into the current index,
              // so hold position — only wrap when this was the last card.
              setIndex((i) => (i >= deck.length - 1 ? 0 : i));
              setDeck((d) => d.filter((c) => c.entryId !== id));
              setFlipped(false);
              await setStatus(id, "learned");
            });
          }}
```

And the counter line:

```tsx
        {flipped ? "Tap to hide" : "Tap to reveal"} · {deck.length} left
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- flashcards`
Expected: PASS, all cases in the file including the existing "2 left" and wrap-around ones.

Then `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

- [ ] **Step 5: Hand off the commit**

Print for the user, do not run:

```
fix: make the review deck a session snapshot so the counter counts down
```

---

### Task 2: Server Actions stop calling `refresh()`

**Files:**
- Modify: `app/actions/words.ts:1-82`
- Modify: `AGENTS.md` (Architecture section, Gotchas section)

**Interfaces:**
- Consumes: nothing.
- Produces: `addWord(rawEntryId)`, `removeWord(rawEntryId)`, `setStatus(rawEntryId, rawStatus)`, `setFrontMode(rawMode)` — all still `async` and still returning `Promise<void>`. Signatures are unchanged; only the refresh side effect goes. Failures continue to reject, which is what Tasks 3–5 catch.

Server Actions are excluded from coverage and globally mocked in `vitest.setup.tsx`, so this task has no unit test of its own. Its correctness is carried by the full suite still passing plus the manual check in Step 3.

- [ ] **Step 1: Remove the four `refresh()` calls and rewrite the rationale comment**

In `app/actions/words.ts`, delete `import { refresh } from "next/cache";` and the `refresh();` line at the end of `addWord`, `removeWord`, `setStatus` and `setFrontMode`. Replace the second paragraph of the top-of-file comment block:

```ts
/*
 * Server Actions are reachable by direct POST, not just through the UI, so
 * every one of these re-authenticates and validates its own input. None of them
 * accepts a user id — `requireUserId()` reads it from the session.
 *
 * They deliberately do not call `refresh()`. User data is never cached
 * server-side, so there is nothing to invalidate; the only thing a refresh did
 * was re-render the route, which costs a round-trip and re-runs every query on
 * the page. The client that issued the write already reflects it optimistically
 * and rolls back if the promise rejects, so these stay pure writes.
 */
```

- [ ] **Step 2: Run the suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass. Nothing asserts on `refresh`, and the actions are mocked in tests.

- [ ] **Step 3: Manual check of the intermediate state**

Run `pnpm dev`, sign in, go to `/list?filter=todo` and press "Mark learned" on a row.

Expected, and correct for this task: the button label flips instantly, the row **stays** on the page, and the badges do not move. That is the degraded intermediate state; Tasks 6 and 7 make the row leave and the badges tick. Reload the page to confirm the write landed — the row should now be under "Learned".

Also confirm on `/review` that switching the front-mode tab no longer changes which card you are looking at.

- [ ] **Step 4: Update AGENTS.md**

In the **Architecture** section, replace this sentence:

> User data is request-time and never cached server-side — it streams behind `<Suspense>` and is invalidated with `refresh()`, not `revalidateTag`.

with:

> User data is request-time and never cached server-side — it streams behind
> `<Suspense>`, and after a write it is the *client* that reflects the change,
> not a server round-trip. Server Actions are pure writes: no `refresh()`, no
> `revalidateTag`. Ordinary navigation re-queries because `staleTimes.dynamic`
> defaults to 0.

In the **Gotchas** section, add:

> - **`refresh()` re-runs uncached queries, so it does not "refresh" a
>   randomly-ordered one — it redraws it.** `getReviewCards` is
>   `ORDER BY random() LIMIT 20`, so a refresh mid-session returned a different
>   twenty and reset the "N left" counter. Client state seeded from a prop like
>   that must own the value and ignore later props; see
>   `app/(app)/review/flashcards.tsx`.

- [ ] **Step 5: Hand off the commit**

```
refactor: make Server Actions pure writes, drop refresh()
```

---

### Task 3: Failed review writes roll back and toast

**Files:**
- Modify: `app/(app)/layout.tsx` (mount `<Toaster>`)
- Modify: `app/(app)/review/flashcards.tsx` ("I know this" handler)
- Test: `app/(app)/review/flashcards.test.tsx`

**Interfaces:**
- Consumes: `Flashcards`' deck state from Task 1.
- Produces: `<Toaster />` mounted once in the signed-in layout. Every later task calls the module-level manager `toast` exported from `@/components/ui/toast` — `toast.add({ type, title, description })` returns a string id. No hook and no provider prop needed; `<Toaster>` defaults its `toastManager` to that same instance.

- [ ] **Step 1: Write the failing test**

Add to `app/(app)/review/flashcards.test.tsx`. Extend the existing imports with `vi` from `"vitest"`, `setStatus` is already imported, and add `import { toast } from "@/components/ui/toast";`. Then, inside `describe('"I know this"')`:

```tsx
    it("puts the card back and warns when the write fails", async () => {
      vi.mocked(setStatus).mockRejectedValueOnce(new Error("offline"));
      const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

      render(<Flashcards cards={deck} initialMode="kanji" />);
      await press("I know this");

      // A silently dropped card is a word the user believes they have learned
      // and the database does not.
      expect(screen.getByText(/3 left/)).toBeInTheDocument();
      expect(screen.getByText("一")).toBeInTheDocument();
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- flashcards`
Expected: FAIL — the deck shows "2 left" and the unhandled rejection surfaces, because nothing catches it yet.

- [ ] **Step 3: Mount the Toaster**

In `app/(app)/layout.tsx`, add `import { Toaster } from "@/components/ui/toast";` and render it as the last child of the outer `<div>`:

```tsx
      {/*
        One manager for the whole signed-in area, which is where every write
        button lives. It reads no request data, so it does not pull anything
        out of the static shell.
      */}
      <Toaster />
```

- [ ] **Step 4: Add the rollback**

In `app/(app)/review/flashcards.tsx`, add `import { toast } from "@/components/ui/toast";` and replace the "I know this" handler from Task 1 with:

```tsx
          onClick={() => {
            const removed = card;
            const at = index;
            startTransition(async () => {
              setIndex((i) => (i >= deck.length - 1 ? 0 : i));
              setDeck((d) => d.filter((c) => c.entryId !== removed.entryId));
              setFlipped(false);
              try {
                await setStatus(removed.entryId, "learned");
              } catch {
                // Back to exactly where it was, index included: the user is
                // mid-session and a card reappearing elsewhere reads as a bug.
                setDeck((d) => [...d.slice(0, at), removed, ...d.slice(at)]);
                setIndex(at);
                toast.add({
                  type: "error",
                  title: "Couldn't save",
                  description: "Check your connection and try again.",
                });
              }
            });
          }}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test -- flashcards`
Expected: PASS, including the Task 1 cases.

Then `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

- [ ] **Step 6: Hand off the commit**

```
feat: roll back and warn when a review write fails
```

---

### Task 4: Front mode without `useOptimistic`

**Files:**
- Modify: `app/(app)/review/flashcards.tsx:88` and the `FrontModeTabs` handler
- Test: `app/(app)/review/flashcards.test.tsx`

**Interfaces:**
- Consumes: `toast` from Task 3.
- Produces: `Flashcards` no longer imports `useOptimistic`. `FrontModeTabs`' props are unchanged: `{ mode: FrontMode; onModeChange: (mode: FrontMode) => void }`.

`useOptimistic` is seeded from its prop, which made sense only while `refresh()` re-rendered the page with the new preference. With pure writes the prop never changes, so the optimistic value has nothing to settle back to — and the rollback path needs to set the value explicitly.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `app/(app)/review/flashcards.test.tsx`. Base UI's `Select` needs a full pointer sequence, but `Tabs` triggers respond to a click:

```tsx
  describe("front mode", () => {
    it("keeps the new front when the preference saves", async () => {
      render(<Flashcards cards={deck} initialMode="kanji" />);

      await press("Romaji");

      expect(setFrontMode).toHaveBeenCalledExactlyOnceWith("romaji");
      expect(screen.getByText("romaji-1")).toBeInTheDocument();
    });

    it("reverts the front when the preference fails to save", async () => {
      vi.mocked(setFrontMode).mockRejectedValueOnce(new Error("offline"));
      const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

      render(<Flashcards cards={deck} initialMode="kanji" />);
      await press("Romaji");

      expect(screen.getByText("一")).toBeInTheDocument();
      expect(screen.queryByText("romaji-1")).not.toBeInTheDocument();
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
    });
  });
```

Add `setFrontMode` to the existing import from `@/app/actions/words`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- flashcards`
Expected: FAIL on the revert case — the front stays on romaji, because nothing restores it.

- [ ] **Step 3: Swap the hook and add the rollback**

In `app/(app)/review/flashcards.tsx`, change the import from `react` to drop `useOptimistic`, and replace the mode state:

```tsx
  const [mode, setMode] = useState(initialMode);
```

Replace the `FrontModeTabs` usage:

```tsx
      <FrontModeTabs
        mode={mode}
        onModeChange={(next) => {
          const previous = mode;
          setMode(next);
          setFlipped(false);
          startTransition(async () => {
            try {
              await setFrontMode(next);
            } catch {
              setMode(previous);
              toast.add({
                type: "error",
                title: "Couldn't save your preference",
                description: "Check your connection and try again.",
              });
            }
          });
        }}
      />
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- flashcards`
Expected: PASS.

Then `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

- [ ] **Step 5: Hand off the commit**

```
feat: keep the front-mode choice in local state with rollback
```

---

### Task 5: `SaveButton` and `StatusButton` own their state

**Files:**
- Modify: `app/(app)/save-button.tsx`
- Modify: `app/(app)/status-button.tsx`
- Test: `app/(app)/save-button.test.tsx`
- Test: `app/(app)/status-button.test.tsx`
- Modify: `AGENTS.md` (Gotchas — the `useOptimistic` bullet)

**Interfaces:**
- Consumes: `toast` from Task 3.
- Produces: both components keep their current props — `SaveButton({ entryId: number; saved: boolean; size?: … })` and `StatusButton({ entryId: number; status: "todo" | "learned" })`. The `saved` and `status` props become **initial values**. Task 7 adds a row context that these two call; this task leaves them standalone.

- [ ] **Step 1: Write the failing tests**

In `app/(app)/save-button.test.tsx`, replace the file docblock and the last test (the `deferred()` one) — the deferred trick existed only because `useOptimistic` snapped back:

```tsx
/**
 * The `saved` prop is an initial value, not a live one: the button holds its own
 * state and the Server Action no longer re-renders the page, so the flipped
 * label sticks without a pending promise to hold it there.
 */
```

Delete the `deferred()` helper and the "flips the label and disables itself while the action is in flight" test, and add:

```tsx
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
```

Add `import { toast } from "@/components/ui/toast";` to that file.

In `app/(app)/status-button.test.tsx`, add the matching pair:

```tsx
  it("keeps the flipped label after the action settles", async () => {
    render(<StatusButton entryId={42} status="todo" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));
    });

    expect(
      screen.getByRole("button", { name: "Mark unlearned" }),
    ).toBeInTheDocument();
  });

  it("reverts and warns when the write fails", async () => {
    vi.mocked(setStatus).mockRejectedValueOnce(new Error("offline"));
    const add = vi.spyOn(toast, "add").mockReturnValue("toast-id");

    render(<StatusButton entryId={42} status="todo" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark learned" }));
    });

    expect(
      screen.getByRole("button", { name: "Mark learned" }),
    ).toBeInTheDocument();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
```

Add `vi` and `toast` imports there if the file lacks them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- save-button status-button`
Expected: FAIL on both revert cases — the label stays flipped and no toast is raised.

- [ ] **Step 3: Rewrite `SaveButton`**

`app/(app)/save-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { addWord, removeWord } from "@/app/actions/words";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function SaveButton({
  entryId,
  saved,
  size = "xs",
}: Readonly<{
  entryId: number;
  saved: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
}>) {
  // `saved` seeds this and nothing re-seeds it: the action no longer refreshes
  // the route, so the button is the authority on its own label until the next
  // navigation re-renders it from the database.
  const [isSaved, setIsSaved] = useState(saved);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={isSaved ? "secondary" : "default"}
      size={size}
      disabled={pending}
      aria-pressed={isSaved}
      onClick={() => {
        const next = !isSaved;
        setIsSaved(next);
        startTransition(async () => {
          try {
            if (next) {
              await addWord(entryId);
            } else {
              await removeWord(entryId);
            }
          } catch {
            setIsSaved(!next);
            toast.add({
              type: "error",
              title: "Couldn't save",
              description: "Check your connection and try again.",
            });
          }
        });
      }}
    >
      {isSaved ? "Saved" : "Save"}
    </Button>
  );
}
```

- [ ] **Step 4: Rewrite `StatusButton`**

`app/(app)/status-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { setStatus } from "@/app/actions/words";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Moves a word between the todo and learned buckets. */
export function StatusButton({
  entryId,
  status,
}: {
  entryId: number;
  status: "todo" | "learned";
}) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const next = current === "learned" ? "todo" : "learned";

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={pending}
      onClick={() => {
        setCurrent(next);
        startTransition(async () => {
          try {
            await setStatus(entryId, next);
          } catch {
            setCurrent(current);
            toast.add({
              type: "error",
              title: "Couldn't save",
              description: "Check your connection and try again.",
            });
          }
        });
      }}
    >
      {current === "learned" ? "Mark unlearned" : "Mark learned"}
    </Button>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test -- save-button status-button`
Expected: PASS.

Then `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

- [ ] **Step 6: Update the AGENTS.md gotcha**

The existing bullet describes `useOptimistic` snapping back and cites `app/(app)/save-button.test.tsx`, which no longer uses it. Replace that bullet with:

> - **A prop that seeds client state is not a live value.** `SaveButton`,
>   `StatusButton` and `Flashcards` all seed from a server prop and then own it,
>   because Server Actions no longer refresh the route. Reading the prop again
>   after a write would show pre-write data. They roll back explicitly in a
>   `catch` instead of letting a transition settle.

- [ ] **Step 7: Hand off the commit**

```
feat: give the save and status buttons owned state with rollback
```

---

### Task 6: The `/list` session provider and live badge counts

**Files:**
- Create: `app/(app)/list/list-session.tsx`
- Create: `app/(app)/list/list-filter-tabs.tsx`
- Modify: `app/(app)/list/page.tsx` (wrap the output, hand the tabs off)
- Test: `app/(app)/list/list-session.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all from `./list-session`:
  - `type Counts = { todo: number; learned: number }`
  - `type CountDelta = Counts` — a **signed** change per bucket, so undoing one is negation.
  - `ListSession({ counts, children }: { counts: Counts; children: React.ReactNode })`
  - `useListCounts(): Counts` — server truth plus this session's deltas.
  - `useListDispatch(): React.Dispatch<CountDelta>` — throws outside a `ListSession`.
  - From `./list-filter-tabs`: `ListFilterTabs({ filter, perPage }: { filter: WordStatus | "all"; perPage: number })`.

Task 7 consumes `useListDispatch` and `CountDelta`.

- [ ] **Step 1: Write the failing test**

Create `app/(app)/list/list-session.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ListFilterTabs } from "./list-filter-tabs";
import { ListSession, useListDispatch } from "./list-session";

/** Dispatches a "moved one word from todo to learned" delta on click. */
function MoveOne() {
  const dispatch = useListDispatch();
  return (
    <button type="button" onClick={() => dispatch({ todo: -1, learned: 1 })}>
      move
    </button>
  );
}

/** Records every render so the test can prove it did not re-render. */
function DispatchProbe({ renders }: { renders: { count: number } }) {
  useListDispatch();
  renders.count += 1;
  return null;
}

describe("ListSession", () => {
  it("renders server counts plus this session's deltas", () => {
    render(
      <ListSession counts={{ todo: 3, learned: 1 }}>
        <ListFilterTabs filter="todo" perPage={20} />
        <MoveOne />
      </ListSession>,
    );

    // Base UI's Button keeps role="button" on anchors, so the tabs are queried
    // by text rather than by the link role.
    expect(screen.getByText("To learn").textContent).toContain("3");

    fireEvent.click(screen.getByRole("button", { name: "move" }));

    expect(screen.getByText("To learn").textContent).toContain("2");
    expect(screen.getByText("Learned").textContent).toContain("2");
  });

  it("does not re-render dispatch-only consumers when the counts change", () => {
    const renders = { count: 0 };

    render(
      <ListSession counts={{ todo: 3, learned: 1 }}>
        <ListFilterTabs filter="todo" perPage={20} />
        <DispatchProbe renders={renders} />
        <MoveOne />
      </ListSession>,
    );
    expect(renders.count).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "move" }));

    // `dispatch` is identity-stable, and `children` is the same element object
    // across ListSession's own re-render, so React bails out of this subtree.
    expect(renders.count).toBe(1);
  });

  it("drops pending deltas when the key changes", () => {
    const session = (key: string) => (
      <ListSession key={key} counts={{ todo: 3, learned: 1 }}>
        <ListFilterTabs filter="todo" perPage={20} />
        <MoveOne />
      </ListSession>
    );

    const { rerender } = render(session("todo:1:20"));
    fireEvent.click(screen.getByRole("button", { name: "move" }));
    expect(screen.getByText("To learn").textContent).toContain("2");

    // page.tsx keys the session on the query that produced `counts`, so a new
    // page is a new session and yesterday's deltas cannot be applied twice.
    rerender(session("todo:2:20"));

    expect(screen.getByText("To learn").textContent).toContain("3");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- list-session`
Expected: FAIL — `Failed to resolve import "./list-session"`.

- [ ] **Step 3: Write `list-session.tsx`**

Create `app/(app)/list/list-session.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo, useReducer } from "react";

export type Counts = { todo: number; learned: number };

/**
 * A signed change to each bucket. Deltas rather than counts, for two reasons:
 * undoing one is negation, and the badges stay `serverCount + delta` so this
 * state never has to be reconciled against a changed prop — the class of bug
 * that made the review counter reset.
 */
export type CountDelta = Counts;

const ZERO: CountDelta = { todo: 0, learned: 0 };

function reducer(total: CountDelta, next: CountDelta): CountDelta {
  return {
    todo: total.todo + next.todo,
    learned: total.learned + next.learned,
  };
}

const CountsContext = createContext<Counts>(ZERO);
const DispatchContext = createContext<React.Dispatch<CountDelta> | null>(null);

/** The badge counts: server truth plus everything this session has changed. */
export function useListCounts() {
  return useContext(CountsContext);
}

export function useListDispatch() {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) {
    throw new Error("useListDispatch must be used inside <ListSession>");
  }
  return dispatch;
}

/**
 * Holds the optimistic count deltas for one rendering of the list.
 *
 * Two contexts, not one, and that split is load-bearing: `dispatch` is
 * identity-stable for the life of the provider, so rows — which only ever
 * write — never re-render when the counts change. Only the tab strip reads
 * CountsContext. `children` arrives from the server component, so it is the
 * same element object when this re-renders and React skips that subtree.
 */
export function ListSession({
  counts,
  children,
}: Readonly<{ counts: Counts; children: React.ReactNode }>) {
  const [delta, dispatch] = useReducer(reducer, ZERO);

  const value = useMemo(
    () => ({
      todo: counts.todo + delta.todo,
      learned: counts.learned + delta.learned,
    }),
    [counts.todo, counts.learned, delta.todo, delta.learned],
  );

  return (
    <DispatchContext value={dispatch}>
      <CountsContext value={value}>{children}</CountsContext>
    </DispatchContext>
  );
}
```

- [ ] **Step 4: Write `list-filter-tabs.tsx`**

Create `app/(app)/list/list-filter-tabs.tsx`, moving `FILTERS` and the tab JSX out of `page.tsx` verbatim except that the counts now come from context:

```tsx
"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { paginationHref } from "@/lib/pagination";
import type { WordStatus } from "@/lib/user-words/queries";
import { useListCounts } from "./list-session";

const FILTERS: Array<{ value: WordStatus | "all"; label: string }> = [
  { value: "todo", label: "To learn" },
  { value: "learned", label: "Learned" },
  { value: "all", label: "All" },
];

/**
 * The filter lives in the URL, so each tab is a <Link> and the active tab is
 * whatever `?filter=` says. `Tabs` is controlled by that value with no
 * onValueChange: navigation, not local state, is what moves the selection.
 * Only the badge numbers are client state.
 */
export function ListFilterTabs({
  filter,
  perPage,
}: Readonly<{ filter: WordStatus | "all"; perPage: number }>) {
  const counts = useListCounts();

  return (
    <Tabs value={filter} className="mb-6">
      <TabsList>
        {FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? counts.todo + counts.learned
              : counts[f.value as WordStatus];
          return (
            <TabsTrigger
              key={f.value}
              value={f.value}
              // The tab is an anchor, not a <button>; without this Base UI
              // warns that it is stripping native button semantics.
              nativeButton={false}
              // Carries the chosen page size across tabs but deliberately not
              // the page: a different filter is a different list, so it starts
              // at the top.
              render={
                <Link
                  href={paginationHref("/list", { filter: f.value, perPage })}
                />
              }
            >
              {f.label}
              <Badge variant="secondary">{count}</Badge>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
```

- [ ] **Step 5: Wire it into `page.tsx`**

In `app/(app)/list/page.tsx`: delete the `FILTERS` array and the whole `<Tabs>…</Tabs>` block, drop the now-unused `Badge`, `Tabs`, `TabsList`, `TabsTrigger` and `paginationHref` imports, and add imports for `ListSession` and `ListFilterTabs`. Wrap the returned fragment:

```tsx
  return (
    // Keyed on the query that produced `counts`, so navigating to another
    // filter or page remounts the session and stale deltas cannot survive.
    <ListSession key={`${filter}:${page}:${perPage}`} counts={counts}>
      <ListFilterTabs filter={filter} perPage={perPage} />

      {words.length === 0 ? (
        /* Keep the existing <Empty>…</Empty> block exactly as it is. */
      ) : (
        /* Keep the existing <ItemGroup> and <PaginationBar> exactly as they
           are; Task 7 is what changes the rows inside ItemGroup. */
      )}
    </ListSession>
  );
```

Both branches keep their current contents verbatim — only the wrapper and the removed `<Tabs>` block change in this task.

`getMyWordCounts()` already returns `{ todo, learned }`, which matches `Counts`.

- [ ] **Step 6: Run the tests**

Run: `pnpm test -- list-session`
Expected: PASS both cases.

Then `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

- [ ] **Step 7: Hand off the commit**

```
feat: add an optimistic count session to the word list
```

---

### Task 7: Rows remove themselves without touching their neighbours

**Files:**
- Create: `app/(app)/row-context.tsx`
- Create: `app/(app)/list/list-row.tsx`
- Modify: `app/(app)/list/page.tsx` (wrap each row)
- Modify: `app/(app)/save-button.tsx`, `app/(app)/status-button.tsx` (call the row)
- Test: `app/(app)/list/list-row.test.tsx`

**Interfaces:**
- Consumes: `useListDispatch`, `CountDelta` from Task 6; the owned button state from Task 5.
- Produces, from `./row-context`:
  - `type RowApi = { setStatus: (to: WordStatus) => void; unsave: () => void; rollback: () => void }`
  - `RowContext` — the context object, for `ListRow` to provide.
  - `useRow(): RowApi | null` — **null** outside a row, which is how `SaveButton` keeps working on `/search` and `/entry/[id]`.
- Produces, from `./list/list-row`:
  - `ListRow({ filter, status, children }: { filter: WordStatus | "all"; status: WordStatus; children: React.ReactNode })`

The context lives in `app/(app)/row-context.tsx`, one level up from the list route, on purpose. `SaveButton` is shared with `/search` and `/entry/[id]`; importing `useRow` from `list/list-row.tsx` would invert the dependency and drag `ListRow`, `ListSession` and `motion` into the search bundle. Shared code imports shared code.

- [ ] **Step 1: Write the failing test**

Create `app/(app)/list/list-row.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ListFilterTabs } from "./list-filter-tabs";
import { useRow } from "../row-context";
import { ListRow } from "./list-row";
import { ListSession } from "./list-session";

/** Stands in for the buttons a real row carries. */
function RowControls({ label }: { label: string }) {
  const row = useRow();
  return (
    <>
      <button type="button" onClick={() => row?.unsave()}>
        unsave {label}
      </button>
      <button type="button" onClick={() => row?.setStatus("learned")}>
        learn {label}
      </button>
      <button type="button" onClick={() => row?.rollback()}>
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

/** Records every render of one row's content. */
function RenderCount({ renders, id }: { renders: Map<string, number>; id: string }) {
  renders.set(id, (renders.get(id) ?? 0) + 1);
  return <span>row {id}</span>;
}

function list(renders: Map<string, number>, filter: "todo" | "all" = "todo") {
  return (
    <ListSession counts={{ todo: 3, learned: 0 }}>
      <ListFilterTabs filter={filter === "all" ? "all" : "todo"} perPage={20} />
      {["a", "b", "c"].map((id) => (
        <ListRow key={id} filter={filter} status="todo">
          <RenderCount renders={renders} id={id} />
          <RowControls label={id} />
        </ListRow>
      ))}
    </ListSession>
  );
}

describe("ListRow", () => {
  it("removes only the unsaved row and ticks its bucket", () => {
    const renders = new Map<string, number>();
    render(list(renders));

    fireEvent.click(screen.getByRole("button", { name: "unsave b" }));

    expect(screen.queryByText("row b")).not.toBeInTheDocument();
    expect(screen.getByText("row a")).toBeInTheDocument();
    expect(screen.getByText("To learn").textContent).toContain("2");
  });

  it("does not re-render the other rows", () => {
    const renders = new Map<string, number>();
    render(list(renders));
    expect(renders.get("a")).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "unsave b" }));

    // `children` is the same element object across a row's own re-render, and
    // rows read only the identity-stable dispatch, so nothing else re-renders.
    expect(renders.get("a")).toBe(1);
    expect(renders.get("c")).toBe(1);
  });

  it("keeps a row that still matches the filter and only moves the counts", () => {
    const renders = new Map<string, number>();
    render(list(renders, "all"));

    fireEvent.click(screen.getByRole("button", { name: "learn a" }));

    expect(screen.getByText("row a")).toBeInTheDocument();
    expect(screen.getByText("To learn").textContent).toContain("2");
    expect(screen.getByText("Learned").textContent).toContain("1");
  });

  it("removes a row that leaves the learned filter", () => {
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

    expect(screen.queryByText("row d")).not.toBeInTheDocument();
    expect(screen.getByText("Learned").textContent).toContain("1");
    expect(screen.getByText("To learn").textContent).toContain("1");
  });

  it("restores the row and the counts on rollback", () => {
    const renders = new Map<string, number>();
    render(list(renders, "all"));

    fireEvent.click(screen.getByRole("button", { name: "learn a" }));
    fireEvent.click(screen.getByRole("button", { name: "undo a" }));

    expect(screen.getByText("To learn").textContent).toContain("3");
    expect(screen.getByText("Learned").textContent).toContain("0");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- list-row`
Expected: FAIL — `Failed to resolve import "./list-row"`.

- [ ] **Step 3: Write `row-context.tsx`**

Create `app/(app)/row-context.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";

import type { WordStatus } from "@/lib/user-words/queries";

export type RowApi = {
  /** Optimistically moves this row to `to`, removing it if it leaves the filter. */
  setStatus: (to: WordStatus) => void;
  /** Optimistically unsaves this row, which always removes it. */
  unsave: () => void;
  /** Undoes this row's last optimistic change, counts included. */
  rollback: () => void;
};

export const RowContext = createContext<RowApi | null>(null);

/**
 * The row this button sits in, or null on /search and /entry/[id] where there
 * is none.
 *
 * Deliberately here rather than beside `ListRow`: SaveButton is shared with
 * those routes, and importing from `list/` would pull the whole list layer
 * into their bundles.
 */
export function useRow() {
  return useContext(RowContext);
}
```

- [ ] **Step 4: Write `list-row.tsx`**

Create `app/(app)/list/list-row.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";

import type { WordStatus } from "@/lib/user-words/queries";
import { RowContext, type RowApi } from "../row-context";
import { useListDispatch, type CountDelta } from "./list-session";

const moveDelta = (to: WordStatus): CountDelta =>
  to === "learned" ? { todo: -1, learned: 1 } : { todo: 1, learned: -1 };

const dropDelta = (status: WordStatus): CountDelta =>
  status === "learned" ? { todo: 0, learned: -1 } : { todo: -1, learned: 0 };

/**
 * One row's optimistic state.
 *
 * The row owns whether it is still on the page, rather than a set of removed
 * ids in a provider that every row would subscribe to: removing row 7 must
 * re-render row 7 and nothing else. Rows only ever *write* to the session, via
 * the identity-stable dispatch, so a count change never reaches them.
 */
export function ListRow({
  filter,
  status,
  children,
}: Readonly<{
  filter: WordStatus | "all";
  status: WordStatus;
  children: React.ReactNode;
}>) {
  const dispatch = useListDispatch();
  const [removed, setRemoved] = useState(false);
  const [current, setCurrent] = useState(status);
  // A ref, not state: nothing renders from it, and a write must not re-render.
  const undo = useRef<{ delta: CountDelta; status: WordStatus } | null>(null);

  const api = useMemo<RowApi>(
    () => ({
      setStatus(to) {
        const delta = moveDelta(to);
        undo.current = { delta, status: current };
        dispatch(delta);
        setCurrent(to);
        // A row that no longer matches the active filter does not belong on
        // this page. Under `all` every bucket matches, so it stays put and only
        // its button label flips.
        if (filter !== "all" && to !== filter) setRemoved(true);
      },
      unsave() {
        const delta = dropDelta(current);
        undo.current = { delta, status: current };
        dispatch(delta);
        setRemoved(true);
      },
      rollback() {
        const last = undo.current;
        if (!last) return;
        dispatch({ todo: -last.delta.todo, learned: -last.delta.learned });
        setCurrent(last.status);
        setRemoved(false);
        undo.current = null;
      },
    }),
    [current, dispatch, filter],
  );

  if (removed) return null;

  return <RowContext value={api}>{children}</RowContext>;
}
```

- [ ] **Step 5: Run the row tests**

Run: `pnpm test -- list-row`
Expected: PASS all five cases.

- [ ] **Step 6: Call the row from the two buttons**

In `app/(app)/save-button.tsx`, add `import { useRow } from "./row-context";`, then inside the component:

```tsx
  const row = useRow();
```

and in the click handler, after `setIsSaved(next)`:

```tsx
        // On /list an unsave takes the row off the page; on /search there is no
        // row and this is a no-op.
        if (!next) row?.unsave();
```

and in the `catch`, before the toast:

```tsx
            row?.rollback();
```

In `app/(app)/status-button.tsx`, add the same import and `const row = useRow();`, then after `setCurrent(next)`:

```tsx
        row?.setStatus(next);
```

and in the `catch`, before the toast:

```tsx
            row?.rollback();
```

- [ ] **Step 7: Wrap the rows in `page.tsx`**

In `app/(app)/list/page.tsx`, add `import { ListRow } from "./list-row";` and wrap each row:

```tsx
            {words.map((word) => (
              <ListRow key={word.entryId} filter={filter} status={word.status}>
                <WordItem
                  entryId={word.entryId}
                  headword={word.headword}
                  reading={word.reading}
                  romaji={word.romaji}
                  glossSummary={word.glossSummary}
                >
                  <StatusButton entryId={word.entryId} status={word.status} />
                  <SaveButton entryId={word.entryId} saved />
                </WordItem>
              </ListRow>
            ))}
```

`WordItem` stays a Server Component; it reaches the client tree as an element, so `RowContext` resolves for the two buttons nested inside it.

- [ ] **Step 8: Run everything**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, including the Task 5 button tests — `useRow()` returns null when there is no provider, so the standalone cases are unaffected.

- [ ] **Step 9: Manual check**

`pnpm dev`, `/list?filter=todo`: "Mark learned" removes the row and both badges move, with no page flash. Under `?filter=all` the row stays and only the label and badges change. Unsaving removes the row under any filter. The pager still shows the pre-write page count — that is the accepted trade-off in the spec, not a bug to fix here.

- [ ] **Step 10: Hand off the commit**

```
feat: remove list rows optimistically without re-rendering their neighbours
```

---

### Task 8: Motion for the card swap and the row exit

Last on purpose: every behaviour above is already tested and shippable, so an animation problem can be rejected without holding up the fix.

**Files:**
- Modify: `app/(app)/review/flashcards.tsx`
- Modify: `app/(app)/list/list-row.tsx`
- Test: `app/(app)/list/list-row.test.tsx` (removal now awaits an exit)

**Interfaces:**
- Consumes: `ListRow` from Task 7, `Flashcards` from Tasks 1–4.
- Produces: no API change. `motion/react` is imported the same way `components/ui/hover-border-gradient.tsx` already does it.

- [ ] **Step 1: Update the removal tests to await the exit**

In `app/(app)/list/list-row.test.tsx`, replace the synchronous removal assertion in "removes only the unsaved row and ticks its bucket":

```tsx
    fireEvent.click(screen.getByRole("button", { name: "unsave b" }));

    await waitForElementToBeRemoved(() => screen.queryByText("row b"));
    expect(screen.getByText("row a")).toBeInTheDocument();
    expect(screen.getByText("To learn").textContent).toContain("2");
```

Make that test `async` and add `waitForElementToBeRemoved` to the `@testing-library/react` import. The count assertion does not move — the delta dispatches immediately, only the DOM node lingers for the exit.

- [ ] **Step 2: Run to verify it still passes**

Run: `pnpm test -- list-row`
Expected: PASS. `waitForElementToBeRemoved` resolves immediately while the node is still removed synchronously, so this step is green before and after the animation lands. That is intended: it makes Step 4 safe rather than proving anything on its own.

- [ ] **Step 3: Animate the card swap**

In `app/(app)/review/flashcards.tsx`, add `import { AnimatePresence, motion } from "motion/react";` and wrap the card button:

```tsx
      {/*
        Keyed on the entry id so a new card is a new element: the outgoing one
        fades while the incoming one rises, which reads as a deck rather than
        text being swapped in place.
      */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.entryId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {/* The existing card <button> moves inside here unchanged. */}
        </motion.div>
      </AnimatePresence>
```

- [ ] **Step 4: Animate the row exit**

In `app/(app)/list/list-row.tsx`, add `import { AnimatePresence, motion } from "motion/react";` and replace `if (removed) return null;` and the return with:

```tsx
  return (
    <AnimatePresence initial={false}>
      {!removed && (
        <motion.div
          // Height as well as opacity: the rows below should close the gap
          // rather than jump once the node is gone.
          initial={false}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.15 }}
          style={{ overflow: "hidden" }}
        >
          <RowContext value={api}>{children}</RowContext>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 5: Run everything**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

If the row tests turn flaky on the exit, wrap the rendered tree in `<MotionConfig transition={{ duration: 0 }}>` from `motion/react` inside the test's `list()` helper rather than lengthening timeouts — the assertion is about removal, not duration.

- [ ] **Step 6: Manual check**

`pnpm dev`: on `/review` the card cross-fades on Skip and on "I know this"; on `/list` a removed row collapses and the rows below slide up.

- [ ] **Step 7: Hand off the commit**

```
feat: animate the card swap and the list row exit
```

---

## Done when

- `/review` counts 20 → 19 → … → "Session complete", and neither the front-mode tabs nor any write reshuffles the deck.
- No click in the signed-in app triggers a route re-render; the DB write happens behind the UI.
- A failed write rolls the UI back and raises an error toast.
- Removing one list row re-renders that row and the tab strip only, proven by `app/(app)/list/list-row.test.tsx`.
- `pnpm lint && pnpm typecheck && pnpm test` pass.
- AGENTS.md no longer claims user data is invalidated with `refresh()`.
