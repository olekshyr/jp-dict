<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

> Everything above this line is generated — leave it alone. Everything below is
> hand-maintained. See [Maintaining this file](#maintaining-this-file) at the
> bottom.

# jp-dict

A Japanese dictionary and vocabulary trainer. Search JMdict by kanji, kana or
romaji; save entries to a personal list; drill the list as flashcards on an
FSRS spaced-repetition schedule.

Next.js 16 (App Router) · React 19 · Neon Postgres via Drizzle · Clerk auth ·
Tailwind v4 + shadcn (Base UI) · deployed on Vercel · pnpm.

## Commands

| | |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm lint` | ESLint — **`next build` no longer runs it**, so run it yourself |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest, single run — unit tests for UI components and pure helpers |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with a v8 coverage report — terminal summary + `coverage/` |
| `pnpm db:generate` | Generate a migration from `lib/db/schema.ts` (no DB connection needed) |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:import` | Re-import JMdict — rewrites the dictionary, see the runbook |

Verify with `pnpm lint && pnpm typecheck && pnpm test` before claiming a change
is done. The suite is unit-only and runs in a few seconds — see [Testing](#testing).

## Architecture

```
app/
  layout.tsx           root: fonts, ClerkProvider (inside <body>), theme script, <Toaster/>
  (app)/               signed-in area — nav chrome + AuthGate
    search/ list/ review/ entry/[id]/
    *.tsx              route-local components, colocated
  actions/words.ts     all Server Actions
components/ui/         shadcn primitives (Base UI under the hood)
lib/
  db/                  schema.ts + client.ts — the only place DATABASE_URL is read
  dictionary/          search, entry lookup, script detection, JMdict tag names
  user-words/          per-user reads/writes; each function calls auth() itself
  srs/                 grades.ts (client-safe vocabulary) + scheduler.ts (FSRS)
  pagination.ts        pure URL-state helpers, shared server + client
scripts/               JMdict importer and verification, run locally only
drizzle/               generated SQL migrations — hand-edited only for a backfill
docs/                  design specs and runbooks
```

**Two data domains, different rules.** Dictionary data is immutable, shared and
cacheable — it belongs in the static shell (`use cache` / `cacheLife`). User
data is request-time and never cached server-side — it streams behind
`<Suspense>`, and after a write it is the *client* that reflects the change,
not a server round-trip. Server Actions are pure writes: no `refresh()`, no
`revalidateTag`. Ordinary navigation re-queries because `staleTimes.dynamic`
defaults to 0. The client-side optimistic layer this implies — `Flashcards`
owning its deck, `/list`'s two-context delta session, per-row removal —
is design and rationale in
`docs/superpowers/specs/2026-08-04-optimistic-writes-design.md`.

**A search-param navigation gets no free loading state.** Changing only `?q`,
`?filter` or `?page` reuses the `<Suspense>` boundary that is already mounted,
so React holds the old rows on screen for the whole round-trip rather than
falling back to the skeleton — the route looks idle while it works. Prefetching
does not help: under `cacheComponents` a prefetch fetches the static shell, and
every list on this app is per-user and uncached, so there is nothing to warm.
`NavPendingProvider` in the `(app)` layout is the answer, and every navigating
control must feed it — `startNavigation` for `router.push` callers, a
`<LinkPending>` inside the anchor for `<Link>`s. `<PendingContent>` reads the
flag and dims what is about to be replaced.

**Authorization lives in the data layer.** `proxy.ts` (Next 16's renamed
`middleware`) runs `clerkMiddleware()` and protects nothing — it can be
CDN-bypassed. Every function in `lib/user-words/` and every Server Action calls
`requireUserId()` itself and takes no `userId` parameter, so a caller physically
cannot pass someone else's id. Keep it that way.

The dictionary functions themselves stay user-blind — no `requireUserId()`,
deliberately, since their results are identical for every user and that is
what makes them cacheable. The guard therefore lives in the render path
instead: any component that can trigger dictionary DB work awaits
`auth.protect()` first (`Results` on `/search`, `RequireAuth` around the
cached entry body), because `AuthGate` is a concurrent `<Suspense>` sibling
and on its own redirects *around* the query, not before it. History and
threat model: `docs/superpowers/specs/2026-08-03-auth-guard-dictionary-queries-design.md`.

## Conventions

<!-- Append here as conventions get established. Keep each one to a sentence or
     two with the reason attached — a rule without a reason gets ignored. -->

- **One component per file**, named in kebab-case after the component
  (`SaveButton` → `save-button.tsx`). Keeps files greppable and `"use client"`
  boundaries tight — a shared file drags every co-located component into the
  same client bundle. When splitting an existing file, split only what's in
  scope for the current task; no codebase-wide sweeps.
- **Route-specific components stay colocated** under `app/(app)/…`; reusable
  primitives go in `components/ui/` and build on the existing shadcn/Base UI
  `Button` etc. rather than hand-rolled elements.
- **Addressable list state lives in the URL** (`?q`, `?page`, `?perPage`,
  `?filter`) — back/forward, refresh and a shared link all land in the same
  place. Per-session optimistic state (`/list`'s count deltas, a row's own
  `removed`, the review deck) is deliberately client state instead: it is
  keyed on the URL state that produced it and reset by navigation, not a
  second source of truth for it. See
  `docs/superpowers/specs/2026-08-04-optimistic-writes-design.md`.
- **Write few comments.** The dense commentary in older files is being removed
  as those files are touched — do not match it, restore it, or treat a missing
  comment as an accident. Prefer names and structure that need no explanation;
  add a short line only where a choice is genuinely surprising and would
  otherwise be undone. Never narrate what the code does. Long-form reasoning
  belongs in this file or in `docs/`, not inline.
- **`use cache` requires care under `cacheComponents: true`.** Anything reading
  request data (auth, cookies, `searchParams`) pulls its subtree out of the
  static shell — isolate it in its own component behind `<Suspense>` rather than
  calling it inline at the top of a layout or page.

## Data & schema notes

- `lib/db/schema.ts` is heavily commented and is the source of truth — read it
  before proposing schema changes; several "missing" things (no PK on
  `search_terms`, no FK from `user_words.user_id`, the surrogate `senses.id`)
  are deliberate and the reasons are written down inline.
- Japanese lookup is **prefix match, not full-text** — Postgres has no Japanese
  tokenizer and Neon offers neither pgroonga nor pg_bigm. English glosses use a
  `simple` tsvector (no stemming) because dictionary lookup is a lookup, not a
  relevance ranking.
- Migrations are generated, reviewed and applied **manually before merge** —
  never inside a build. Never run `drizzle-kit push`. A data backfill is the one
  thing hand-written into a generated file, and it belongs in the same migration
  as the DDL it supports; `0004` is the example.
- **Scheduling is FSRS**, via `ts-fsrs`, and the five SM-2-shaped columns the
  MVP reserved were re-purposed rather than used as designed — `ease` is gone,
  `stability`/`difficulty`/`state`/`learning_steps`/`last_review_at` are new.
  `review_log` is append-only and exists so parameters can one day be fitted to
  a user's own history; nothing writes to it but `gradeCard`, and nothing reads
  it yet. Design and rationale:
  `docs/superpowers/specs/2026-08-20-fsrs-scheduling-design.md`.
- **`status` is a retire flag, not a lifecycle.** A word never "becomes
  learned" under FSRS — it earns longer intervals. `/list`'s New / Learning /
  Mature buckets are derived from `state` and `interval_days`, in two places
  that must agree: `bucketOf` in `lib/srs/scheduler.ts` and the `CASE` in
  `lib/user-words/queries.ts`. The duplication is deliberate — filtering and
  counting have to happen in SQL — and `MATURE_DAYS` is the only threshold.
- The app uses the neon-http driver (one HTTP request per statement); the
  importer uses a plain `pg` TCP connection and a direct (unpooled) URL.
- `data/` (60 MB `JMdict_e.xml`, 33 MB `JmdictFurigana.json`) is gitignored and
  absent from CI and Vercel. Re-import runbook:
  `docs/superpowers/specs/2026-07-28-deploy-strategy-design.md` §6.

## Testing

Vitest + Testing Library, per the guide shipped with the installed Next
(`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`). Tests are
colocated as `*.test.ts(x)` next to what they cover; `vitest.config.mts` and
`vitest.setup.tsx` sit at the root.

**What is worth testing here.** Behavior, not markup: URL vocabulary
(`lib/pagination.ts`, `PaginationBar`'s hrefs), the query-routing helpers, the
optimistic buttons, `Flashcards`' index arithmetic. The `components/ui/`
wrappers that only spread props and emit `cva` class strings are Base UI's
tests, not ours — `components/ui/pagination.tsx` is the exception because it
clones its `render` element to inject the active-state attributes.

**The setup file mocks aggressively, and that is the point.** The cost in this
repo is not rendering, it is what a component drags in, so `vitest.setup.tsx`
stubs four modules globally:

- `@/app/actions/words` — it is `"use server"` and imports `lib/db/client.ts`,
  which **throws at module load** without `DATABASE_URL`. `vi.mock` is hoisted,
  so the real module never evaluates and tests need no env and no database.
- `next/navigation` — the hooks throw outside a Next runtime. The stub is a
  mutable store in `test/next-navigation.ts`: set a pathname, assert on
  `router.push`.
- `next/link` — the real one wants an app-router context that does not exist
  under Vitest. A plain anchor loses nothing, since every assertion is on `href`.
- `lucide-react` — the barrel evaluates the whole icon set per test file.

Everything actually under test stays real: `@base-ui/react`, `wanakana`,
`lib/pagination.ts`, `clsx`/`tailwind-merge`. Pure-logic tests open with
`// @vitest-environment node` and skip jsdom entirely.

Async Server Components (pages, `layout.tsx`) are **out of scope** — the Next
docs state Vitest does not support them and recommend E2E instead.

**Coverage** (`pnpm test:coverage`) is scoped rather than whole-repo, so the
percentage means something: `coverage.include` in `vitest.config.mts` covers
`app/`, `lib/` and the two `components/` files we own, and `coverage.exclude`
drops what is out of scope by decision — async pages, Server Actions, the DB
and `use cache` layers, generated `tags.ts`, and `components/ui/` (vendored
shadcn, rewritten wholesale on upgrade; `pagination.tsx` is named back in
because we modified it). Add to those lists when scope changes, rather than
letting a 0% row sit there permanently.

No coverage thresholds are enforced — the report is a map of the gaps, not a
gate. The terminal table lists **only files below 100%**; the v8 text reporter
collapses the rest regardless of `skipFull`, so read
`coverage/coverage-summary.json` or `coverage/index.html` for the full picture.

## Environments

`production` and `dev` are Neon branches of the same project;
`.env.local` points at **`dev`** and no production connection string should ever
sit on a developer machine. Production runs a Clerk **production** instance;
local and preview use the Clerk *development* instance, and its keys are the
only ones that belong in `.env.local`. Full topology, migration workflow and
growth triggers: `docs/superpowers/specs/2026-07-28-deploy-strategy-design.md`.

## Gotchas

<!-- Append here when something costs you more than a few minutes to figure out.
     Format: the symptom, then the cause. -->

- `middleware.ts` doesn't exist in Next 16 — it's `proxy.ts`.
- `ClerkProvider` wrapping `<html>` fails with "Uncached data was accessed
  outside of `<Suspense>`" under `cacheComponents`. It goes inside `<body>`.
- `next lint` and the `eslint` key in `next.config.ts` were removed in Next 16;
  `next build` runs no linting at all.
- Search `ORDER BY` clauses must end in `entry_id ASC`. The ranking keys are
  full of ties and Postgres breaks them differently per execution, so without a
  total order LIMIT/OFFSET pages repeat and skip rows.
- Base UI's `Button` keeps `role="button"` even with `nativeButton={false}`, so
  an `<a href>` rendered through it — every pagination link, the "Back to my
  list" button — is announced as a button, not a link. Tests query those by
  text; `getByRole("link")` will not find them.
- **A prop that seeds client state is not a live value.** `SaveButton`,
  `StatusButton` and `Flashcards` all seed from a server prop and then own it,
  because Server Actions no longer refresh the route. Reading the prop again
  after a write would show pre-write data. They roll back explicitly in a
  `catch` instead of letting a transition settle.
- **An optimistic update must be scheduled *outside* `startTransition`.** An
  async `startTransition` callback is a React Action, and updates scheduled
  inside one are withheld until its promise settles — so an "optimistic" write
  put there is not optimistic at all: the UI freezes for the whole round-trip.
  `SaveButton`, `StatusButton` and `Flashcards` all set state first and wrap
  only the `await` plus the rollback. `useTransition`'s `isPending` still
  reports correctly either way, which is what makes the mistake easy to miss.
- Base UI's `Select` commits an item off the full pointer sequence
  (pointerdown → pointerup → mouseup → click), not a bare `fireEvent.click`.
- **`Number.isInteger` is not a bound on a number from the URL.** `1e21` passes
  it, serializes to `1e+21`, and Postgres answers `invalid input syntax for type
  bigint` — a 404 becomes a 500. `parsePagination` caps at `MAX_PAGE` and
  `parseEntryId` accepts only the canonical decimal form; any new numeric route
  param needs the same treatment before it reaches a query.
- **A `use cache` function's arguments *are* its cache key**, so unbounded user
  input must never be one — with `cacheLife('max')` that is unbounded permanent
  entries. `searchEntries` is deliberately *not* cached itself: it clamps the
  query and delegates to a cached inner function, which is the pattern to copy.
- **`useLinkStatus` is the only way to observe a `<Link>` click**, and it must
  be called from a descendant of that `<Link>`. An `onClick` is not a
  substitute: it also fires for ⌘-click and middle-click, which open a new tab
  and never navigate, so the UI would stay pending forever. Report upward from
  an effect — updates scheduled inside the router's transition are withheld
  until it commits, which is the very thing being covered.
- **`unstable_instant` is a build-time assertion, not a runtime feature.** It
  costs nothing at runtime and fails the build when a boundary moves somewhere
  that would block navigation. `/search` and `/list` both export it; a route
  reading search params needs the `runtime` form with every param present in
  every sample and `null` where absent.
- **`refresh()` re-runs uncached queries, so a review session must own its
  deck.** This began as a random-order problem — `getReviewCards` was
  `ORDER BY random() LIMIT 20`, so a refresh handed back a different twenty and
  reset the "N left" counter. Selection is deterministic now, and the hazard is
  no smaller: a refresh re-selects everything still due, which is every card
  already answered this session whose new due date has not passed. Client state
  seeded from a prop like that must own the value and ignore later props; see
  `app/(app)/review/flashcards.tsx`.
- **`enable_short_term: false` and `interval_days integer` are one decision,
  not two.** With short-term steps on, FSRS answers a failed card in minutes;
  that rounds to a 0-day interval and a `due_at` in the past, and the card is
  then permanently due. The same-session retry is bought back in the client
  instead — "Again" sends the card to the back of the deck. Turning the flag on
  means giving `interval_days` sub-day resolution first.
- **`due_at` is NOT NULL in practice for every row, and the review query
  depends on it.** Migration `0004` backfills it from `added_at` and `addWord`
  always sets it, so the session predicate is a clean `due_at <= now()` range
  scan on `user_words_due_idx`. Reintroducing a NULL means the predicate needs
  `OR due_at IS NULL`, which forces a BitmapOr and gives up the index-served
  ordering. The column stays nullable in DDL only because tightening it would
  be a separate deploy.
- **There is deliberately no cap on new words, and none on session size.** Both
  existed once (`NEW_PER_SESSION`, `SESSION_LIMIT`) and neither limited anything:
  a `LIMIT` is re-applied by every page load, so grade five, refresh, and the
  next five arrive. The fix is not to make the cap real. Anki and WaniKani pace
  intake because their pool is external — a deck you downloaded, or a
  curriculum that gates lessons behind mastering prerequisite kanji. Here the
  pool is assembled by hand, one dictionary search at a time, so intake is
  already controlled at the point of saving and a second lever only adds a
  reload ritual. The only bound left is `MAX_DECK`, and it is a payload guard,
  not a pace: a serialized `Card` runs ~300–400 bytes, so 500 is ~175 KB and
  stops a deck neglected into the thousands from shipping megabytes and running
  FSRS over every row. If pacing is ever wanted it belongs to the user as a
  setting, not to the app as a rule.
- **The forecast is bucketed by hour because the app stores no timezone.**
  `users` holds `id`, `front_mode`, `created_at` and nothing else, and the
  server runs UTC, so it cannot know where a viewer's midnight falls — 23:00 UTC
  is already tomorrow in Tokyo and still today in Los Angeles. `getDueForecast`
  answers in hours, which are timezone-free and bounded at 168 rows however
  large the deck; `toForecastDays` sums them into local days in the browser.
  Two consequences worth keeping: the query clamps overdue rows to the current
  hour with `greatest(…)`, or one neglected word yields a row per hour since it
  was due; and `now() + 7 days` is exact rather than generous, because local
  midnight today is always at or before now, so the seventh local day always
  ends within 168 hours.
- **`DueForecast` renders a skeleton until mounted, and that is not a loading
  state.** Which local day an hour falls in depends on the viewer's clock, which
  the server does not have, so any day it rendered risks a hydration mismatch.
  The gate is `useSyncExternalStore` returning `false` on the server and `true`
  after, not a `setState` in an effect — `react-hooks/set-state-in-effect`
  rejects the latter, and it would re-render for nothing. Any client component
  deriving calendar days needs the same treatment.
- **Date formatting names its locale explicitly.** `toLocaleDateString` with
  `undefined` takes the OS language, which in `lib/srs/forecast.ts` would have
  translated "Wed" while the hardcoded "Today" and "Tomorrow" beside it stayed
  English — the app is English throughout and stores no locale. Passing
  `"en-US"` is the fix, and the same applies anywhere else `Intl` gets used.
- **`lib/srs/grades.ts` must never import `ts-fsrs`.** It is the half of the
  scheduling module that client components are allowed to touch — grade labels,
  bucket names, interval formatting. Everything that actually schedules lives
  in `lib/srs/scheduler.ts` and stays server-side, which is why grade buttons
  get their intervals as strings on the `Card` DTO and from `gradeCard`'s
  return value rather than computing them.
- **`blur` does not fire when React unmounts a focused element.** A save-on-blur
  control therefore loses the edit whenever its container closes — collapsing a
  `/list` note, navigating away mid-edit. `NoteEditor` commits from an effect
  cleanup, and that flush must *not* go through `startTransition`: the component
  is gone, so its state updates are no-ops and a rollback has nothing to roll
  back. It fires a plain promise whose `.catch` reaches the global toast
  manager. For the same reason, a value the blur handler reads has to be
  mirrored into a ref — Escape blurs the field in the very event that reverts
  it, before React has applied the state.
- **User-authored text is rendered as a React text child, never as HTML.**
  `user_words.note` is the only free-form text the app stores. Rendering
  newlines wants `whitespace-pre-wrap`, not `dangerouslySetInnerHTML`;
  truncation wants `line-clamp`, not a slice that can split a surrogate pair.
  The 2000-character cap in `noteSchema` is the control — a Server Action is
  reachable by direct POST, so the textarea's `maxLength` is only a courtesy.

- **The sans stack must keep its Japanese tail.** `--sans` / `--mono` in
  `app/globals.css` end in real Japanese families because Inter and Geist Mono
  are `latin`-subset only. Drop them and every kana/kanji falls to the
  browser's last-resort face — Hiragino on macOS (fine, which is why the bug
  hides there) but MS PGothic on Windows, whose embedded bitmaps look jagged
  below ~20px. That is why it surfaced in the search field and note textarea
  and not on entry pages: those render Japanese at `text-5xl`, where MS
  PGothic switches to outlines. Fallback is per-glyph, so the tail costs Latin
  text nothing. next/font must not claim the `--font-sans` name itself (it owns
  `--font-inter`), or the composed stack cannot use it.

## Maintaining this file

This file is the project's durable memory — it should grow as we work.

- Add to it when a decision, convention or gotcha will still matter in a month
  and isn't already obvious from the code. Put it in the matching section above.
- Don't add: restatements of what the code says, one-off task notes, or
  changelog entries. If it would go stale in a week, it doesn't belong here.
- Record the **reason**, not just the rule. Rules without reasons get
  misapplied at the edges.
- Prune anything that's been contradicted by a later change rather than
  stacking a correction on top of it.
- Keep the generated block at the top untouched — a tool owns it and will
  rewrite it in place.

`CLAUDE.md` just imports this file, so there is one place to edit.
Machine-readable memory Claude keeps on its own lives in a local user folder that is inside `~/.claude`;
anything worth sharing with a teammate belongs here instead.
