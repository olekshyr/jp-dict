# FSRS spaced repetition

**Date:** 2026-08-20
**Status:** Implemented

## Goal

`user_words` had carried five nullable columns since migration `0000` —
`due_at`, `interval_days`, `ease`, `repetitions`, `lapses` — under a comment
promising that "SM-2/FSRS can be layered on without a migration". Nothing ever
read or wrote them. The live model was a two-value enum: `setStatus` flipped
`todo`/`learned`, `getReviewCards` was `WHERE status = 'todo' ORDER BY random()
LIMIT 20`, and the review screen offered Skip (which persisted nothing) and
"I know this" (terminal). **A word could be reviewed exactly once.** There was
no repetition in the spaced repetition.

## Decision

**FSRS, with four-button grading, an append-only review log, and `/list`
buckets derived from the schedule.**

FSRS rather than the SM-2 those columns were shaped for: it schedules on
measured memory stability and difficulty instead of a single ease multiplier,
and it is what Anki ships today. The cost is that the schema comment's promise
does not hold — FSRS needs `stability`, `difficulty`, `state`, `learning_steps`
and `last_review_at` of its own, and its actual advantage (fitting parameters to
one user's history) is impossible without a log of reviews. Both were added.

Alternatives considered and rejected:

- **SM-2.** Free — the columns already fit. Rejected because "the columns
  already fit" is not a reason to ship the worse scheduler, and the migration
  to add five nullable columns is a single deploy.
- **Leitner boxes.** Simplest of all, but `ease`/`stability` go unused and the
  intervals are fixed for every word regardless of how hard it is.
- **Storing the card as `jsonb`.** One column instead of nine, and a perfect
  round-trip of the `ts-fsrs` `Card`. Rejected because the review query is
  `due_at <= now()` ordered by `due_at`, and that has to be an index scan.
- **Two-button grading (Again / Good).** Closest to the Skip / "I know this"
  pair being replaced, and lowest friction. Rejected because with two grades
  `difficulty` barely moves and FSRS degrades toward a fixed multiplier — the
  grade *is* the input to the algorithm.
- **Real sub-day learning steps.** Anki-faithful (1m, 10m before graduating),
  but `interval_days` is an integer and there is nowhere to put ten minutes.
  See "The short-term switch" below.
- **Making session size and the new-word cap user settings.** A migration, an
  action and a settings panel for two numbers nobody has yet asked to change.
  `SESSION_LIMIT` and `NEW_PER_SESSION` are constants in
  `lib/user-words/queries.ts` until someone does.

### The short-term switch

`lib/srs/scheduler.ts` runs FSRS with `enable_short_term: false`, and that
single flag is the hinge the whole design hangs on.

With short-term steps enabled, FSRS answers a failed card in minutes. That
interval has nowhere to live: `interval_days` is an `integer`, so ten minutes
rounds to `0`, and a `due_at` in the past makes the card permanently due. With
it disabled, every interval FSRS returns is a whole number of days ≥ 1 —
verified directly in `lib/srs/scheduler.test.ts`, which asserts exactly that
across new, once-reviewed and twice-reviewed cards.

What that gives up is the same-session retry, and the client takes it back:
answering "Again" sends the card to the *back of the deck* rather than dropping
it, so the word comes round again before the session ends. The database sees a
one-day interval and a lapse; the user sees the card again in two minutes.
Nobody needs a sub-day column for that.

A consequence worth writing down: with short-term steps off, FSRS never
produces `State.Learning` or `State.Relearning`. Every card is `New` (0) or
`Review` (2). `bucketOf` still handles 1 and 3 — it is one comparison, and it is
what makes the flag reversible — but no row will hold them today.

### Previews are computed on the server

Each grade button shows what it would schedule ("Good · 6d"). The obvious way to
get that is `scheduler.repeat()` in the client component, which puts `ts-fsrs`
in the browser bundle and gives the app two places that know how to schedule.

Instead `getReviewCards` computes all four labels per card and ships them on the
`Card` DTO, and `gradeCard` **returns** the fresh set for the card it just
rescheduled. That return value is what makes the "Again" re-queue exact: the
card goes to the back of the deck immediately with the labels it had, and they
update when the write settles — long before it comes round again.

The split that enforces this is `lib/srs/grades.ts` (vocabulary, labels and
formatters, no `ts-fsrs` import) versus `lib/srs/scheduler.ts` (everything that
schedules). Client components import only the former. The build output confirms
it: no client chunk contains `ts-fsrs`.

### `status` is now a retire flag, not a lifecycle

Under FSRS a word never "becomes learned" — it just earns longer intervals. So
`status` stops trying to describe progress and describes only whether the word
is in rotation at all, and `/list` derives its buckets from the schedule:

| Bucket | Condition |
|---|---|
| New | `state = 0` |
| Learning | in review but interval < 21 days, or a transitional state |
| Mature | `state = 2 AND interval_days >= 21` (Anki's threshold) |
| Retired | `status = 'learned'` |

The four are exhaustive, so `All` is their sum. "Learning" deliberately absorbs
*young* review cards rather than leaving a fifth bucket nobody asked for.

`setStatus` touches nothing but `status`: retiring freezes the schedule, so
putting a word back resumes it rather than restarting from new. That is what
makes `SavedWord` carry `bucket` (always schedule-derived, never `"retired"`)
alongside `status` — a row knows the bucket it will return to, so retire and
un-retire are a two-way toggle rather than a state machine.

## Changes

### 1. `lib/db/schema.ts`

`user_words` keeps `due_at`, `interval_days`, `repetitions` and `lapses` — they
map onto the `ts-fsrs` `Card` unchanged — and gains `stability`, `difficulty`,
`state` (NOT NULL DEFAULT 0), `learning_steps` and `last_review_at`.

`ease` was **dropped**. The deploy spec's additive-migration rule exists because
old and new code run concurrently against one schema; no deployed version of
this app has ever referenced `ease`, so no concurrent request could break. It is
removed in its own migration (`0005`) rather than alongside the additions, which
also keeps `drizzle-kit generate` from having to guess whether it was renamed.

New `review_log` mirrors the `ts-fsrs` `ReviewLog` field for field, so a
scheduling result is stored verbatim. Every column below `rating` is the state
the card was in **before** the review; the state after is on `user_words`.

One field is renamed rather than mirrored. `ts-fsrs` calls it `due`, but
`buildLog` stores `last_review || due` — the moment of the *previous* review,
not a due date. The column is `prev_review_at`, because a column named `due`
holding a last-review timestamp is a trap. `lib/srs/scheduler.test.ts` pins the
mapping.

New index `user_words_due_idx` on `(user_id, status, due_at)`. Default btree
order (ASC, NULLS LAST) is exactly what the session query asks for, so it serves
the predicate and the ORDER BY together.

### 2. Migrations `0004` and `0005`

`0004` is additive and carries one hand-written statement — the only place in
`drizzle/` that is ever edited by hand:

    UPDATE "user_words" SET "due_at" = "added_at" WHERE "due_at" IS NULL;

This is load-bearing. With every row carrying a `due_at`, the session predicate
is `due_at <= now()`; without the backfill it would need `OR due_at IS NULL`,
which forces a BitmapOr and gives up the index-served ordering. `addWord` sets
`dueAt` for the same reason. A word saved and never reviewed is due from the
moment it was saved, which is also the behaviour anyone would expect.

`due_at` stays nullable in DDL — tightening it to NOT NULL is a separate deploy
and not worth one.

### 3. `lib/srs/`

`grades.ts` — `GRADES`, `GRADE_LABELS`, `BUCKETS`, `LIST_FILTERS`,
`FILTER_LABELS`, `MATURE_DAYS`, the type guards, and the two interval
formatters. No `ts-fsrs` import, so client components can use it.

`scheduler.ts` — `toFsrsCard`/`fromFsrsCard` (the only place the row-to-card
mapping lives), `schedule`, `preview`, `bucketOf`. Both are pure, both are
tested under the `node` environment with no mocking at all.

### 4. `app/actions/words.ts` — `gradeCard`

Reads the scheduling columns, calls `schedule()`, then writes the card update
and the log row through **`db.batch`** — one HTTP request, one implicit
transaction. The neon-http driver otherwise sends a statement per round-trip,
and a card rescheduled without its log entry is history the optimizer can never
recover. Returns the new previews.

No optimistic-concurrency guard on the update, deliberately: a card leaves the
deck the instant it is clicked, so the UI cannot grade the same state twice, and
a guard would only skip the update while the log row still landed — splitting
the two apart to prevent something unreachable.

### 5. `lib/user-words/queries.ts`

`getReviewCards` runs two queries in parallel — up to `SESSION_LIMIT` due
reviews and up to `NEW_PER_SESSION` new words — merges, truncates and shuffles.
Both are `ORDER BY due_at ASC, entry_id ASC`; the tiebreak is not decoration,
because `due_at` ties are everywhere (every word saved before the backfill
shares one) and a `LIMIT` over a ranking key with ties has no stable answer
without a total order.

Selection is deterministic and only presentation order is random, which is the
opposite of the old `ORDER BY random()`.

`getMyWordCounts` groups by a SQL `CASE` that duplicates `bucketOf`. The
duplication is deliberate: filtering and counting have to happen in the
database, and reading every row back to bucket it in JavaScript would turn a
paged list into a full scan.

`getNextDueAt` is new — one indexed row, so the empty review screen can say when
to come back rather than implying the user is finished.

### 6. `app/(app)/review/`

Skip and "I know this" are replaced by Again / Hard / Good / Easy, each labelled
with the interval it would schedule.

The grades cannot be present before the card is flipped — rating a word you have
not tried to recall is not a review. The first attempt rendered them disabled, to
hold the layout steady across the flip, and that was wrong: four dead buttons
with a filled "Good" among them read as a broken primary action, and nothing on
screen said what to do next. The row now holds **one full-width "Reveal answer"
button** before the flip and the four grades after it, both `h-14`. Same
steadiness, and the space carries the actual next step instead of a locked
version of the step after it.

The card stays clickable and toggles both ways; the button only ever reveals, so
their accessible names are distinct ("Flip to the answer" / "Reveal answer").

**All four grades carry equal visual weight.** "Good" was filled at first, copied
from Anki — but Anki fills it because Space is bound to it, and the fill is
telling you what the default key does. Nothing is bound here, so the fill was
only a thumb on the scale. These are four honest answers to "how well did you
know it", not one recommended action with three alternatives, and a user torn
between Hard and Good should not be pushed by the styling: the grade *is* the
input to the scheduler. If keyboard shortcuts are added later (1-4, Space for
Good), the highlight earns its place back and should return with them.

`Flashcards` lost its `index` state entirely. With no Skip, nothing moves
*through* the deck — a card is either answered and gone, or answered and sent to
the back — so the card on screen is always the head, and the whole class of
wrap-around index bugs the old tests guarded goes with it. The deck is still
client-owned and still ignores later `cards` props.

`{deck.length} left` now means words not yet recalled, because an "Again" leaves
the card in the deck. That is a better counter than the old one.

### 7. `/list`

`Counts` becomes `Record<ListFilter, number>` and `CountDelta` a `Partial` of
it, so a move names only the two buckets it moves between. `negate()` replaces
the hand-written per-key negation in `ListRow.rollback`. The two-context split
and the delta-not-count design are unchanged — both were right.

`ListRow` takes `bucket` as well as `status` and computes the tab a row shows
under. The default filter is now `all`: under the old split, `todo` was the only
sensible landing tab because `learned` was a graveyard; now every bucket is a
real place a word can be.

`StatusButton` reads "Retire" / "Put back".

## Accepted trade-offs

- **The `bucketOf` / `bucketSql` duplication.** Two expressions of one rule,
  pinned only by `MATURE_DAYS` being shared and by tests. Justified above; the
  alternative is worse.
- **Parameter optimization is not built.** `computeParameters` lives in
  `@open-spaced-repetition/binding`, a native/WASM package that has no business
  in a Vercel function. `review_log` exists so this can become a
  `scripts/optimize-fsrs.ts` run locally, writing a per-user parameter array to
  a `users` column. Nothing here blocks it; nothing here starts it.
- **No timezone handling, and none needed.** `due_at` is a timestamp compared
  against `now()`, so there is no day-rollover boundary to define. A "reviews
  done today" statistic would need one; there isn't one.
- **The review page runs `getNextDueAt` on every load** for a value used only
  when the session is empty. It is one indexed row on an index the session query
  already uses, run in the same `Promise.all` — cheaper than a second round-trip
  on the branch that needs it.
- **Deferring within a session is "Later", not a grade.** This shipped as a
  follow-up: the four grades are all FSRS answers, so the only way to see a word
  again this session was "Again", which also records a lapse and moves `due_at`
  — and a refresh then showed a smaller deck. "Later" rotates the card to the
  back of the client deck and writes nothing, so the word stays due. It is
  deliberately not a fifth grade and not a member of `GRADES`.
- **Retiring is still on `/list`, not in review.** An "Easy" grade schedules far
  enough out to be the same thing in practice.

## Verification

`pnpm lint && pnpm typecheck && pnpm test` — 244 tests, 22 files.
`pnpm build` passes, which is what re-checks the `/list` `unstable_instant`
samples after the filter vocabulary changed.

The bundle claim is checked, not assumed: no chunk under `.next/static/`
contains `ts-fsrs` internals, while the review UI's own strings are there.

Migrations were generated, reviewed, hand-edited for the backfill, and applied
to the `dev` Neon branch before merge, per the deploy spec.
