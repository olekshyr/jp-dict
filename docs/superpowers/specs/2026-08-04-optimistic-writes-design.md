# Optimistic writes and a stable review deck

**Date:** 2026-08-04
**Status:** Approved design, ready for implementation

## Why it happens

`/review` shows "20 left" and the number does not go down when you press
"I know this". The card changes, so the click clearly worked.

`setStatus` ends with `refresh()` (`app/actions/words.ts:69`). That re-renders
`Session` (`app/(app)/review/page.tsx:22`), which re-runs `getReviewCards(20)`.
The query is uncached per-user data, so it executes for real: the card just
learned is now `status = 'learned'` and drops out, but `LIMIT 20` **refills from
the user's other todo words** and `ORDER BY random()`
(`lib/user-words/queries.ts:163`) reshuffles what remains.

`Flashcards` stays mounted across that refresh, so its `done` state survives —
but `remaining = cards.filter((c) => !done.includes(c.entryId))`
(`flashcards.tsx:92`) now filters a *different* twenty rows. The learned id is
not in the new deck to be filtered out, nothing is removed, and the count lands
back on 20. The word changed because index 0 of a freshly shuffled deck is a
different card, not because the session advanced.

**Evidence.** A test that presses "I know this" on a three-card deck (correctly
"2 left"), then re-renders with `[7, 2, 9]` — what a refill plus reshuffle
returns — fails asserting "2 left" and passes asserting "3 left". The counter
provably resets to the new deck size.

Two knock-on effects: `setFrontMode` also calls `refresh()`, so switching the
front-mode tab reshuffles the deck mid-session; and the "hold position" comment
at `flashcards.tsx:168` reasons about an index into a deck that no longer exists
by the time it matters.

The deeper problem is that `refresh()` makes every write a whole-route
re-render, which is the source of the sluggishness on `/list` and `/search` too.

## Decision

**The client owns post-write UI state; Server Actions become pure writes.**
`refresh()` comes out of all four actions in `app/actions/words.ts`. Every
mutating click updates local state immediately, sends the write in the
background, and rolls back with an error toast if it fails.

A review session is a fixed set of cards drawn once. "20 left" counts down
20 → 19 → 18 → done, and nothing outside the component can reshuffle it.

Alternatives considered and rejected:

- **Snapshot the deck, keep `refresh()`.** One line, fixes the counter, and
  leaves every click paying for a full route re-render. Treats the symptom.
- **Relabel the counter as a live count of unlearned words.** Honest about the
  current behaviour, but there is then no session and no "session complete" —
  the page becomes an endless queue.
- **Adopt a state manager (zustand).** Evaluated in detail below; deferred.
- **Hand-rolled `useSyncExternalStore` store for the list.** Gives per-row
  selector subscriptions, but rows do not need to subscribe to anything (see
  §3) — each row is removed by buttons inside its own subtree. Subscriptions
  would be O(rows) selector runs per removal to replace O(1) local state.

### On adopting a state manager

zustand 5.0.14 is compatible (peer `react >=18`, this app is on React 19.2.4)
and nothing comparable is installed. It is not adopted now, for reasons that
are about this app rather than about the library:

- There are exactly two pieces of shared client state, and both are scoped to a
  single route. Neither outlives a navigation.
- Under the App Router a store must be per-request, so the recommended pattern
  is a store factory behind a React context provider. That is *more* wiring than
  §3 needs, not less.
- The render-granularity requirement is met without it, and better: per-row
  local state means rows are not subscribers at all.
- Reset-on-navigation is free with a keyed provider; with a store it has to be
  written and tested.

**Revisit when** a third surface needs the same optimistic overlay, or when
client state must survive navigation. The concrete trigger is a review session
that persists across `/review → /entry/[id] → /review`; today that remount draws
a fresh random twenty, and a module-scoped client store is the natural fix.
That is a product decision, not a refactor, and is out of scope here.

## Changes

### 1. `Flashcards` owns the deck

`app/(app)/review/flashcards.tsx`. The `cards` prop becomes a seed:

```tsx
// The deck IS the session. Seeded from the server once and never re-synced:
// getReviewCards refills to 20 and re-randomises on every call, so adopting a
// later prop would silently swap the deck out from under the count.
const [deck, setDeck] = useState(cards);
```

The `done` array and the `remaining` filter are deleted. "I know this" removes
the card outright and keeps today's index rule — hold position so the next card
slides in, wrap only if this was the last one:

```tsx
setDeck((d) => d.filter((c) => c.entryId !== id));
setIndex((i) => (i >= deck.length - 1 ? 0 : i));
```

The counter becomes `{deck.length} left`, which is then literally true. Card
swaps get an `AnimatePresence` keyed on `entryId` via `motion/react`, already a
dependency (`components/ui/hover-border-gradient.tsx` uses it).

### 2. Server Actions stop calling `refresh()`

`app/actions/words.ts`. All four actions drop `refresh()` and stay `void`; a
failure rejects and the caller catches it. The comment block at the top
explaining the refresh policy is rewritten to explain the absence instead: user
data is never cached server-side, and the UI that triggered the write already
reflects it, so re-rendering the route on every click buys nothing and costs a
round-trip plus a re-query.

Correctness after a write still holds on ordinary navigation: `staleTimes.dynamic`
defaults to 0 seconds — "not cached" — so these dynamic per-user pages re-query
when moving between `/search`, `/list` and `/review`. Browser back/forward is the
documented exception (see Accepted trade-offs).

### 3. `/list` optimistic layer

Marking learned under `?filter=todo` must remove the row and tick both tab
badges. Those live in different subtrees, so they need shared state — but
**removing one row must not re-render the others**, which rules out a single
`removedIds` set that every row subscribes to.

Rows write to the session; they never read from it.

- **`ListRow`** (new client component) holds its own `removed` boolean and
  provides a small per-row context to its buttons. `StatusButton` and
  `SaveButton` sit inside that subtree, so "this word is gone" travels down one
  row's tree and no further. Removing row 7 re-renders row 7 alone.
- **`CountsContext`** — read only by the tab strip, which moves into its own
  client component (`list-filter-tabs.tsx`). Badges tick, tab strip re-renders,
  rows do not.
- **`CountsDispatchContext`** — a `useReducer` dispatch. Its identity is stable
  for the life of the provider, and a context whose value never changes identity
  never re-renders its consumers. Rows consume this one only.

`ListRow` takes the row content as `children`, composed by the server component.
When `ListRow` re-renders from its own state the `children` prop is the same
object reference, so React bails out of that subtree: the headword, reading and
gloss never re-render, only the wrapper animating out.

The reducer holds **deltas**, not counts; badges render `serverCount + delta`.
Copying server counts into state would need syncing against props, which is the
same class of bug as the one this spec fixes.

When a row removes itself, given the active `filter` (passed down from the
server component, which already parsed it):

| Action | Row removed? | Delta |
|---|---|---|
| Mark learned, `filter=todo` | yes | `todo −1, learned +1` |
| Mark learned, `filter=all` | no, label flips | `todo −1, learned +1` |
| Mark unlearned, `filter=learned` | yes | `learned −1, todo +1` |
| Unsave (any filter) | yes | the row's current bucket `−1` |

The rule: remove iff `filter !== "all" && newStatus !== filter`, and always on
unsave, since every row on `/list` is a saved word.

The provider is keyed on `` `${filter}:${page}:${perPage}` `` so navigation
remounts it and stale deltas cannot survive.

`useRow()` returns `null` outside a row, so `SaveButton` keeps working
standalone on `/search` and `/entry/[id]`. The row context lives one level up
from the list route, in `app/(app)/row-context.tsx`: `SaveButton` is shared with
those routes, and importing it from `list/` would invert the dependency and pull
the whole list layer into their bundles.

### 4. Rollback and toasts

`components/ui/toast.tsx` is Base UI's, exporting a standalone manager from
`createToastManager()` — error paths call `toast` directly, no hook needed.
`<Toaster>` is mounted in the root `app/layout.tsx` — it was already there
from the shadcn install, and root turns out to be the right place rather than
a stopgap: it reads no request data, so it does not pull the static shell out
from under `cacheComponents`; a single mount there covers every route
including `/sign-in`, where a failed sign-in has nowhere else to surface an
error toast.

Every write is wrapped:

```tsx
try {
  await setStatus(entryId, next);
} catch {
  rollback();
  toast.add({ type: "error", title: "Couldn't save", description: "Check your connection and try again." });
}
```

In review, rollback returns the card to the deck at its old position.

`useOptimistic` in `save-button.tsx` and `status-button.tsx` becomes `useState`.
With no `refresh()` there is no server round-trip to re-seed from, and the
rollback path needs to set state explicitly rather than let a transition settle.

### 5. Front mode

`useOptimistic` becomes `useState`; the preference write goes out in the
background with the same rollback. Because `setFrontMode` no longer refreshes,
changing tabs can no longer reshuffle the deck mid-session.

### 6. Documentation

- **AGENTS.md, Architecture:** "invalidated with `refresh()`, not
  `revalidateTag`" is now false. Replace with the new rule — user data is
  invalidated by the client that wrote it, and re-queried on navigation.
- **AGENTS.md, Gotchas:** add that `refresh()` re-runs uncached queries, so any
  randomly-ordered or `LIMIT`-refilled query it touches returns a different set;
  client state seeded from such a prop must not adopt later prop values.
- **AGENTS.md, Gotchas:** the `useOptimistic` bullet cites
  `app/(app)/save-button.test.tsx` as its example. That component no longer uses
  `useOptimistic`; either repoint the example or drop the bullet.

## Accepted trade-offs

Each of these is a consequence of the client owning post-write state. All three
are self-correcting on the next real navigation, and none can put wrong data in
the database.

- **Pagination totals stay server-truth.** Unsaving three rows on page 2 shrinks
  the visible rows but leaves the pager claiming five pages until you navigate.
  Making the pager exact means moving the whole list client-side, including the
  clamp logic in `app/(app)/list/page.tsx` that already handles landing past the
  end. Not worth it for this.
- **Browser back/forward restores a pre-write page.** The client cache does not
  cache pages by default, but it *does* reuse them for back/forward, expressly
  to preserve scroll position. So: mark a word learned, open the entry, press
  Back — the row is there again and the badges are stale, because the restored
  payload predates the write. The database is correct and any forward navigation
  re-queries. Calling `refresh()` on `/list` writes would close this, at the cost
  of the whole-route re-render this spec exists to remove.
- **A review session does not survive navigation.** Leaving `/review` and coming
  back remounts `Flashcards` and draws a fresh random twenty. This is the trigger
  condition for revisiting a state manager, above.
- **Unsaving every row on a page leaves a blank list area.** `words.length ===
  0` is evaluated once, on the server; the "Nothing here yet" empty state is
  chosen at that point and does not appear if the last rows are optimistically
  removed client-side afterward, and the pager keeps claiming the original
  page count for the same reason as the first trade-off above. Self-correcting
  on navigation, same class as the other two.

## Verification

`pnpm lint && pnpm typecheck && pnpm test`, plus:

- **Deck immunity** — press "I know this" on a three-card deck, re-render with a
  different three-card deck, assert "2 left". This is the failing test from the
  Evidence section; it passes only after §1.
- **Countdown** — deck length decrements per "I know this", `setStatus` called
  once with `(id, "learned")`, session-complete state at zero.
- **Skip** — leaves the count alone and wraps at the end (existing tests).
- **Rollback** — a rejecting `setStatus` restores the card and calls the toast
  manager; assert via a spy on `toast.add`.
- **Render granularity** — render a list, remove one row, assert a per-row
  render counter incremented for that row and the tab strip only. This makes the
  constraint a regression test rather than a claim in a document.
- **Count deltas** — each row of the table in §3, including the `filter=all`
  case where the row stays but the badges move.
- **Provider reset** — changing the key drops pending deltas.

Async Server Components stay out of scope per AGENTS.md; `coverage.include` in
`vitest.config.mts` needs the new client components added.
