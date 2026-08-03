# Auth Guard Ahead of Dictionary Queries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make anonymous requests to `/search` and `/entry/[id]` redirect to sign-in *before* any dictionary database work runs.

**Architecture:** Server-side `auth.protect()` checks placed in the render path immediately upstream of the first component that can reach Neon. The dictionary data layer (`searchEntries`, `getEntry`) stays user-blind and cacheable; the guard sits in front of the cache, never inside it. Spec: `docs/superpowers/specs/2026-08-03-auth-guard-dictionary-queries-design.md`.

**Tech Stack:** Next.js 16 App Router (`cacheComponents`), Clerk (`@clerk/nextjs/server`), React 19, pnpm.

## Global Constraints

- **Never run `git commit` or `git add`.** The user commits manually after reviewing each task's diff. A "commit checkpoint" step means: stop and tell the user the task is ready to commit.
- Verify with `pnpm lint && pnpm typecheck && pnpm test` before calling any task done (from AGENTS.md).
- **No new unit tests.** The changed components are async Server Components, which Vitest does not support in this repo (see AGENTS.md → Testing). Verification is the command trio above plus the manual repro in Task 4.
- Clerk's server auth import is `import { auth } from "@clerk/nextjs/server"` — `auth.protect()` redirects a signed-out document request to sign-in.
- Comments explain *why*, not *what* — match the density of neighboring comments.
- One component per file, kebab-case named after the component.

---

### Task 1: Guard `/search` — `auth.protect()` at the top of `Results`

**Files:**
- Modify: `app/(app)/search/page.tsx` (imports at top; `Results` starts near line 58)

**Interfaces:**
- Consumes: `auth` from `@clerk/nextjs/server` (already a dependency; the `(app)` layout imports it the same way).
- Produces: nothing consumed by later tasks — `Results` is route-internal.

- [ ] **Step 1: Add the import**

In `app/(app)/search/page.tsx`, after the existing `next/link` import, add:

```tsx
import { auth } from "@clerk/nextjs/server";
```

- [ ] **Step 2: Add the guard as the first statement of `Results`**

The function currently begins:

```tsx
async function Results({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchPageParams>;
}>) {
  const { q = "", ...rest } = await searchParams;
```

Change the body to begin:

```tsx
async function Results({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchPageParams>;
}>) {
  /*
   * Results renders concurrently with the layout's AuthGate, so without this
   * an anonymous request reaches Neon before the redirect lands. Serialised
   * here rather than in searchEntries: the data layer stays user-blind and
   * cacheable; the guard rides the component that is already request-time.
   */
  await auth.protect();

  const { q = "", ...rest } = await searchParams;
```

Nothing else in the file changes.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass. (`Results` is already dynamic — it reads `searchParams` — so `unstable_instant` validation is unaffected.)

- [ ] **Step 4: Commit checkpoint**

Tell the user Task 1 is ready to review and commit. Do not run git commands.

---

### Task 2: Guard `/entry/[id]` — `RequireAuth` wrapper around the cached body

**Files:**
- Create: `app/(app)/require-auth.tsx`
- Modify: `app/(app)/entry/[id]/page.tsx` (imports near line 9; the `<Suspense>` block near lines 174–205)

**Interfaces:**
- Consumes: `auth` from `@clerk/nextjs/server`.
- Produces: `RequireAuth({ children }: Readonly<{ children: React.ReactNode }>)` — an async Server Component exported from `app/(app)/require-auth.tsx`, the pattern for any future `(app)` route that reaches the dictionary.

- [ ] **Step 1: Create `app/(app)/require-auth.tsx`**

```tsx
import { auth } from "@clerk/nextjs/server";

/**
 * Serialises the sign-in check ahead of whatever it wraps. The layout's
 * AuthGate is a concurrent Suspense sibling, so on its own it redirects
 * *around* work, not before it — anything that must not run for an anonymous
 * request (in practice: dictionary queries, whose data layer is deliberately
 * user-blind and cacheable) goes inside this instead. React does not render an
 * async component's children until it resolves, so a Neon miss behind a
 * `use cache` child waits on auth here.
 */
export async function RequireAuth({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await auth.protect();
  return children;
}
```

- [ ] **Step 2: Wrap `<EntryBody>` in the entry page**

In `app/(app)/entry/[id]/page.tsx`, add the import after the existing relative imports:

```tsx
import { RequireAuth } from "../../require-auth";
```

Then wrap the `EntryBody` element inside the existing `params.then(...)` — the block currently reads:

```tsx
{params.then(({ id }) => (
  <EntryBody
    id={id}
    saveSlot={...}
  />
))}
```

Change it to (keep the existing `saveSlot` JSX and its comments exactly as they are):

```tsx
{params.then(({ id }) => (
  /*
    EntryBody is `use cache`, so the auth check cannot live inside it. The
    wrapper stops an anonymous request from populating — or racing to read —
    the cached body, at the accepted cost of the prerendered top-200 bodies
    now streaming behind the check instead of shipping in the static shell.
    saveSlot needs no wrapping: EntrySaveButton already goes through
    requireUserId.
  */
  <RequireAuth>
    <EntryBody
      id={id}
      saveSlot={...}
    />
  </RequireAuth>
))}
```

(`...` above stands for the existing, unchanged `saveSlot` prop — the `<Suspense key="save">` block already in the file. Do not retype it; only indent it one level.)

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 4: Commit checkpoint**

Tell the user Task 2 is ready to review and commit. Do not run git commands.

---

### Task 3: Documentation — AGENTS.md convention + old spec status

**Files:**
- Modify: `AGENTS.md` (the "One consequence of that split…" paragraph in Architecture)
- Modify: `docs/superpowers/specs/2026-08-02-unauthenticated-search-queries.md` (header lines 3–4)

**Interfaces:** none — prose only.

- [ ] **Step 1: Rewrite the AGENTS.md paragraph**

Replace this paragraph in the Architecture section:

> One consequence of that split is known and accepted rather than fixed: the
> dictionary search has no `requireUserId()` of its own — deliberately, since its
> results are user-independent — and `AuthGate` is a concurrent `<Suspense>`
> sibling, so a signed-out request runs the query before the redirect lands. No
> results reach the client; the cost does. Reasoning, evidence and the options:
> `docs/superpowers/specs/2026-08-02-unauthenticated-search-queries.md`.

with:

> The dictionary functions themselves stay user-blind — no `requireUserId()`,
> deliberately, since their results are identical for every user and that is
> what makes them cacheable. The guard therefore lives in the render path
> instead: any component that can trigger dictionary DB work awaits
> `auth.protect()` first (`Results` on `/search`, `RequireAuth` around the
> cached entry body), because `AuthGate` is a concurrent `<Suspense>` sibling
> and on its own redirects *around* the query, not before it. History and
> threat model: `docs/superpowers/specs/2026-08-03-auth-guard-dictionary-queries-design.md`.

- [ ] **Step 2: Update the old spec's status**

In `docs/superpowers/specs/2026-08-02-unauthenticated-search-queries.md`, change:

```markdown
**Status:** Known issue, accepted for now — documented rather than fixed
```

to:

```markdown
**Status:** Fixed 2026-08-03 — see
[2026-08-03-auth-guard-dictionary-queries-design.md](./2026-08-03-auth-guard-dictionary-queries-design.md)
```

Leave the rest of the document untouched — it is the historical record and evidence.

- [ ] **Step 3: Verify**

Run: `pnpm lint`
Expected: pass (markdown is untouched by ESLint; this is a smoke check that nothing else was accidentally edited).

- [ ] **Step 4: Commit checkpoint**

Tell the user Task 3 is ready to review and commit. Do not run git commands.

---

### Task 4: Manual verification — anonymous requests do no DB work

**Files:** none modified.

**Interfaces:**
- Consumes: the guards from Tasks 1–2.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` (background). Wait for "Ready".

- [ ] **Step 2: Anonymous search**

Run: `curl -si "http://localhost:3000/search?q=%E3%81%82" | head -30`
Expected: a redirect/sign-in response (Clerk 307 or an HTML body whose links point at sign-in — mirror the original evidence: grepping the body for entry links finds nothing). The dev server log must show **no** query work for the request — previously this line appeared: `GET /search?q=あ 200 in 1113ms (application-code: 1016ms)`. Application-code time should now be a few ms.

- [ ] **Step 3: Anonymous entry page (uncached id)**

Pick an id outside the prerendered top-200 common entries, e.g. `1000050`:

Run: `curl -si "http://localhost:3000/entry/1000050" | head -30`
Expected: same shape — sign-in redirect, no query timing in the log.

- [ ] **Step 4: Signed-in flow unchanged**

Ask the user to spot-check in a signed-in browser: search for ねこ, paginate, open an entry (both a common one and an uncached one), toggle a save button. Expected: identical behavior to before, entry body streams in behind its skeleton.

- [ ] **Step 5: Full check + wrap-up**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass. Stop the dev server. Report results to the user; all commits remain theirs to make.
