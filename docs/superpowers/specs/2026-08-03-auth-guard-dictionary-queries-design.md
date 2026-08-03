# Auth guard ahead of dictionary queries

**Date:** 2026-08-03
**Status:** Approved design, ready for implementation
**Fixes:** the accepted issue in
[2026-08-02-unauthenticated-search-queries.md](./2026-08-02-unauthenticated-search-queries.md)

## Decision

Anonymous requests must trigger **no dictionary database work**. The guard is a
server-side auth check placed in the render path, immediately upstream of the
first component that can reach Neon — on both `/search` and `/entry/[id]`.

The dictionary data layer (`searchEntries`, `getEntry`) stays user-blind and
fully cacheable. That user-blindness is what makes the cache shareable across
users, so the guard sits *in front of* the cache, never inside it.

Alternatives considered and rejected:

- **Guard inside the data layer** (mirroring `requireUserId`): works for
  `searchEntries`' uncached wrapper, but `getEntry` is called from inside
  `use cache` scopes and from `generateStaticParams` at build time, where there
  is no request to read auth from. Half a solution.
- **Structural gate in the layout** (`AuthGate` wrapping `children`): closes
  every route in one move, but serialises auth ahead of every page's content and
  pulls each page's prerendered shell out of the static shell — the streaming
  design the app is built around. Too blunt.
- **Making search public**: rejected — signed-in-only was the product
  decision. Edge-level traffic controls are a deployment concern, tracked in
  the deploy strategy spec rather than here.

## Changes

### 1. `/search` — guard at the top of `Results`

`app/(app)/search/page.tsx`, first line of `Results`:

```tsx
async function Results({ searchParams }) {
  // Results renders concurrently with the layout's AuthGate, so without this
  // an anonymous request reaches Neon before the redirect lands. Serialised
  // here rather than in searchEntries: the data layer stays user-blind and
  // cacheable; the guard rides the component that is already request-time.
  await auth.protect();
  const { q = "", ...rest } = await searchParams;
  ...
```

`Results` already reads `searchParams`, so it is already dynamic — no change to
the static shell or to streaming. `auth.protect()` redirects to sign-in exactly
as `AuthGate` does, and it is an in-process JWT verification, not a network
round-trip.

### 2. `/entry/[id]` — `RequireAuth` wrapper around the cached body

New file `app/(app)/require-auth.tsx`:

```tsx
export async function RequireAuth({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return children;
}
```

`EntryBody` is `use cache`, so the check cannot go inside it. Instead
`RequireAuth` wraps `<EntryBody>` inside the existing `<Suspense>` boundary in
`app/(app)/entry/[id]/page.tsx`. React does not render an async component's
children until it resolves, so the cached body — and any Neon miss behind it —
waits on auth. The `saveSlot` needs no wrapping: `EntrySaveButton` already goes
through `requireUserId`.

The file lives in `app/(app)/` rather than the entry folder because it is the
pattern for any future route in the group that reaches the dictionary.

**Accepted trade:** the build-time prerender now stops at `RequireAuth`, so the
top-200 common entries ship as skeleton-plus-stream instead of full bodies in
the static shell. `generateStaticParams` and `getCommonEntryIds` are untouched —
they run at build time only and are not an anonymous surface.

### 3. Layout unchanged

`AuthGate` in `app/(app)/layout.tsx` stays exactly as it is. It remains the
navigation guard; the new checks are the enforcement. Routes whose data is
entirely `lib/user-words/` (`/list`, `/review`) are already enforced by
`requireUserId` and gain nothing from further changes.

### 4. Documentation

- `AGENTS.md`: rewrite the "known and accepted rather than fixed" paragraph in
  the Architecture section into the new convention — *any component that can
  trigger dictionary DB work awaits `auth.protect()` before it* — with the
  reason (the data layer must stay user-blind to stay cacheable, so the guard
  lives in the render path).
- `2026-08-02-unauthenticated-search-queries.md`: change status to
  "Fixed 2026-08-03" with a pointer to this spec.

## Why this holds against non-UI clients

The guard is attached to the code path that touches the DB, not to a URL shape.
Every reachable entry point passes through it:

- **Document and RSC payload requests** (`?_rsc=…`, `RSC: 1` header) execute the
  same server component tree; only the response wire format differs. `Results`
  and `RequireAuth` run either way.
- **Server Action POSTs** (`Next-Action` header) all go through
  `requireUserId()` in the data layer, which throws without a session.
- **`proxy.ts` is not relied on.** It can be CDN-bypassed; `auth.protect()` in
  the render fails closed — missing middleware context is an error, not an
  allow.
- There is no separate API route serving dictionary data.

## Scope boundary

This guard protects the **database**, not raw compute: like any web endpoint,
turning a request away still spends a few milliseconds serving the rejection.
Protecting that layer is an edge/CDN concern, independent of the render tree
and of this design. Signed-in usage is bounded by `clampQuery`, `MAX_PAGE` and
the cache (only the first hit per key is expensive), and is attributable to an
account.

## Verification

Async Server Components are outside Vitest's scope in this repo, so:

1. `pnpm lint && pnpm typecheck && pnpm test` — no regressions.
2. Manual repro mirroring the original evidence, against the dev server with no
   session cookie:
   - `GET /search?q=あ` → sign-in redirect, **no** query timing in the server
     log (previously ~1s of application code).
   - `GET /entry/<uncached id>` → sign-in redirect, no query.
3. Signed-in flow unchanged: search, pagination, entry pages, save buttons.

No new unit tests: the pure helpers gain no new logic, and the guard components
are async Server Components.
