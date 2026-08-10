# Per-word notes

**Date:** 2026-08-09
**Status:** Implemented

## Goal

A saved word carried only a status. Users want to attach their own material to
one — a translation into their native language, a mnemonic, a counter word, a
usage remark — and nothing in the app could hold it.

Three surfaces, three different answers:

| Surface | Behaviour |
|---|---|
| `/entry/[id]` | Note visible and editable, open by default. Absent entirely when the word isn't saved. |
| `/list` | Collapsed to its first line under the gloss; the preview *is* the toggle, and the editor opens in that same place. |
| `/review` | No note at all. Flashcards are unchanged. |

This is the first feature that stores free-form user text and renders it back,
so the security section below is part of the design rather than a postscript.

## Decision

**The note is a nullable column on `user_words`, written by a pure Server Action
and autosaved on blur; the client owns what is on screen, as everywhere else in
this app.**

Alternatives considered and rejected:

- **Explicit Save / Cancel buttons.** Predictable and the easiest thing to test,
  but two extra controls per row on `/list`, in a row that already carries two
  buttons. Rejected in favour of blur, with a `Saving… / Saved` status line
  doing the work the button's absence leaves behind.
- **Debounced autosave while typing.** Most seamless, but it turns one note into
  a stream of writes, needs timer control in every test, and makes rollback
  ambiguous when a later write is already in flight. Blur bounds writes by user
  interaction instead.
- **A separate `notes` table.** One note per saved word is a column, not a
  relation. Revisit if notes ever need history, per-sense targeting, or to
  outlive an unsave.
- **Upserting the `user_words` row from `setNote`.** Would let a note be written
  for a word that isn't saved, which is precisely the state the entry page is
  designed not to show. `setNote` is update-only.
- **A dialog for the `/list` editor.** Keeps rows fixed-height, but needs a
  Dialog primitive the project doesn't vendor and reads as the opposite of "edit
  it in that same place".

### On the shared saved-state context

Hiding the note area until the word is saved means the Save toggle has to reveal
it, and `SaveButton` owns that boolean in local state no sibling can read.
`app/(app)/saved-context.tsx` carries **only an override** —
`boolean | null`, where `null` means "trust what the server rendered" — so the
provider needs no awaited data and can sit above the `<Suspense>` boundaries
that fetch it. `useSaved()` returns `null` on `/search` and `/list`, exactly as
`useRow()` does outside a list row, so neither route changes.

## Changes

### 1. `lib/db/schema.ts` — `user_words.note`

Nullable `text`, unindexed. "No note" and "empty note" are the same thing to the
UI, and the column is only ever projected alongside a row already found by
`user_id`. Migration `drizzle/0003_bright_oracle.sql` is a bare `ADD COLUMN`.

### 2. `lib/user-words/queries.ts`

`SavedWord` gains `note: string | null` and `getMyWords` projects it. New
`getSavedWord(entryId)` returns `{ status, note } | null` for the entry page — a
single `(user_id, entry_id)` unique-index lookup, kept separate from
`getSavedEntryIds`, which answers set membership for a whole page of results.

`getReviewCards` is untouched: `Card` never gains a note.

### 3. `app/actions/words.ts` — `setNote`

```ts
const noteSchema = z.string().max(2000);

export async function setNote(rawEntryId: unknown, rawNote: unknown) {
  const userId = await requireUserId();
  const entryId = entryIdSchema.parse(rawEntryId);
  const note = noteSchema.parse(rawNote).trim();

  await db
    .update(userWords)
    .set({ note: note === "" ? null : note })
    .where(and(eq(userWords.userId, userId), eq(userWords.entryId, entryId)));
}
```

Pure write, no `refresh()`, rejects on failure — the contract from
[2026-08-04-optimistic-writes-design.md](./2026-08-04-optimistic-writes-design.md).

`entryIdSchema` also gained `.max(Number.MAX_SAFE_INTEGER)` while this file was
open. `.int()` accepts `1e21`, which serializes as `"1e+21"` and reaches
Postgres as `invalid input syntax for type bigint` — a rejected input arriving
as a 500. `parseEntryId` already guarded the route param; the actions did not.

### 4. `app/(app)/note-editor.tsx` — the shared editor

Used unchanged by both surfaces. Seeds from its prop and then owns the text, as
`SaveButton` and `StatusButton` do. Three things in it are not obvious:

- **The value is mirrored into a ref.** Escape blurs the field in the same event
  that reverts it, and blur runs before React has applied the state — so a
  commit reading `value` from a render closure would write back the text the
  user just abandoned.
- **An unmount flush.** React fires no `blur` when it unmounts a focused
  element, so collapsing a `/list` row or navigating away mid-edit would drop
  the edit. An effect cleanup commits what's outstanding.
- **That flush must not use `startTransition`.** The component is gone, so its
  state updates are no-ops; the write goes out as a plain promise with a
  `.catch` that reaches the global toast manager.

### 5. Entry page

`EntryBody` gains a second pass-through slot, `noteSlot`, built exactly like
`saveSlot`: its own `<Suspense>`, an explicit `key` because it crosses the
`use cache` boundary as a prop, and declared-but-never-read so it stays out of
the cache entry. Its fallback is `null` rather than a skeleton — the slot
resolves to nothing at all for an unsaved word, and a placeholder that vanishes
reads worse than one that was never there.

`EntryNote` (server) parses the id with `parseEntryId` before touching the DB,
then hands `EntryNotePanel` (client) the server's answer. The panel renders when
`override ?? saved`.

### 6. `/list`

`WordItem` gains an optional `footer`, rendered inside `ItemContent` *after* the
entry `<Link>` — the same reason the action buttons are already a separate slot:
nesting the note in the anchor would make every click on it navigate away.
`RowNote` owns the committed note locally so the preview updates without a
round-trip, and `<NoteEditor onCommit>` feeds it both the commit and the
rollback.

Notes touch neither counts nor row removal, so `RowNote` stays clear of `RowApi`
entirely.

## Security

- **Authorization is unchanged in shape.** `setNote` takes no `userId`;
  `requireUserId()` reads it from the session, and the `WHERE` is scoped by
  `user_id` *and* `entry_id` — without the former, any signed-in user could
  overwrite another's note by guessing an entry id. `proxy.ts` protects nothing;
  the check in the action is the check.
- **Validation.** `z.string()` is doing real work beyond typing — without it an
  array or object would be bound as a query parameter. The 2000 is UTF-16 code
  units (~8 KB of UTF-8 worst case, well inside the 1 MB Server Action body
  limit). The textarea's `maxLength` mirrors it; the schema is the control.
- **Rendering.** The note reaches the page as a React text child in all three
  places, so it is escaped. **Never `dangerouslySetInnerHTML`**, including the
  tempting `\n` → `<br>` version — `whitespace-pre-wrap` instead. No markdown,
  no URL auto-linking (which would open `javascript:`/`data:` hrefs without an
  allow-list). The `/list` preview truncates with `line-clamp-1`, not a slice,
  which could cut a surrogate pair in half.
- **Exposure.** The failure path logs the error, never the note. The toast stays
  generic. `setNote` against an unsaved entry matches 0 rows and returns
  normally rather than throwing, which would make it an oracle for row
  existence.
- The column is unindexed and unsearchable, so no note content reaches a query
  plan, a URL, or a cache key. It must never become a `use cache` argument.

## Accepted trade-offs

- **Two queries on the entry page** where one row would do. The save button and
  the note land in different places in the cached markup, so neither can render
  the other; both are unique-index lookups on the same row.
- **A note written as a row is being unsaved is a race** — collapsing unmounts
  the editor, whose flush writes against a row the delete may already have
  removed. Either order ends in the same state, and no wrong data can persist.
- **Escape reverts the field, not the database.** A note already committed on a
  previous blur stays committed; there is no undo beyond retyping.
- **The unmount flush loses its own rollback.** If that write fails the user
  sees the error toast but the text is gone with the component — the honest
  outcome for a field that no longer exists.

## Verification

```
pnpm lint && pnpm typecheck && pnpm test
```

Named cases: **Trim and collapse** (blur saves the trimmed value; a cleared note
sends `""`), **Idle blur** (unchanged text writes nothing), **Rollback** (a
rejected write restores the field, the `/list` preview, and fires an error
toast), **Escape** (reverts without writing), **Unmount flush** (an edit still in
the field when the row collapses is saved), **Reveal** (the note panel appears
the moment Save is clicked and vanishes on unsave), **Footer placement** (the
note is not inside the entry link), **Literal text** (markup in a note renders as
text on both surfaces).
