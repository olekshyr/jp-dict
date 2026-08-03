# Unauthenticated dictionary queries on `/search`

**Date:** 2026-08-02
**Status:** Fixed 2026-08-03 — see
[2026-08-03-auth-guard-dictionary-queries-design.md](./2026-08-03-auth-guard-dictionary-queries-design.md)

## Summary

A signed-out request to `/search?q=…` executes the full dictionary query against
Neon before the auth gate stops the render. The user is redirected to sign-in and
sees nothing, but the database round-trip and the `use cache` write have already
happened. Anyone who can reach the URL can make the app do dictionary work
without an account.

This is a cost and availability concern, **not** a data-disclosure one. It was
found during a review of the search path on 2026-08-02, alongside the unbounded
`?page` and unbounded cache-key issues, which were fixed in the same pass.

## Why it happens

`app/(app)/layout.tsx` puts `AuthGate` (`await auth.protect()`) in its own
`<Suspense>` boundary, and `app/(app)/search/page.tsx` puts `Results` in another.
Siblings render concurrently, so `Results` reaches `searchEntries` before — or
alongside — the gate's redirect. That boundary split is deliberate and load-bearing:
reading auth is request-time work, and doing it inline would pull the whole
`(app)` subtree out of the static shell. The gate is a navigation guard, not the
authorization boundary; the real boundary is `requireUserId()` inside every
function in `lib/user-words/`.

So the ordering is a consequence of the streaming design, not an oversight in it.
The dictionary is simply the one query that has no `requireUserId()` of its own —
by design, because its results are identical for every user, which is what makes
them shareable and cacheable in the first place.

## Evidence

Reproduced against the `dev` Neon branch with no session cookie:

```
GET /search?q=あ            200 in 1113ms (application-code: 1016ms)
⨯ Error: Not authenticated   lib/user-words/auth.ts:18   ← getSavedEntryIds, after the query
```

The 1.0s is the dictionary query; `getSavedEntryIds` throws only afterwards. The
clearest proof that the query really reaches Postgres came from the `?page`
bug that was fixed the same day — an anonymous request produced a driver-level
error from inside `latinMatches`:

```
GET /search?q=neko&page=1e21
NeonDbError: invalid input syntax for type bigint: "1e+22"   (lib/dictionary/search.ts)
```

**No results leak.** The response body for an anonymous search contains only the
sign-in redirect — grepping it for entry links returns nothing, and for
`sign-in` returns four matches.

## What already limits the blast radius

The fixes applied on the same day cut the amplification substantially:

- `clampQuery` (`MAX_QUERY_LENGTH = 64`) bounds how much text a request can
  push into a query and into a cache key.
- `MAX_PAGE = 10_000` bounds the offset and the number of distinct pages per
  query.
- `searchEntries` clamps *before* delegating to the cached inner function, so the
  `cacheLife('max')` key space is bounded rather than open-ended.
- Repeat queries are cache hits and cost no database time at all — only the first
  request for a given `(query, page, perPage)` is expensive, and the widest
  observed query is ~1s.

What remained — until the 2026-08-03 guard closed it — was that an anonymous
client could mint new first-time queries, each costing one Neon round-trip and
one permanent cache entry, up to the bounded key space.

## Options that were considered (the first one was implemented)

| Option | Cost |
|---|---|
| `await auth()` at the top of `Results`, before `searchEntries` | Simplest and complete. Adds an auth round-trip to the critical path of every search, serialised ahead of the query rather than concurrent with it. |
| Move the guard into `proxy.ts` via `clerkMiddleware`'s matcher | Cheapest at runtime, but the proxy is explicitly *not* the authorization boundary here — it can be CDN-bypassed — so this would reduce cost without actually closing the hole. |
| Rate-limit `/search` at the edge | Treats the symptom rather than the ordering, and adds a dependency. |

The first option is the honest fix; it was left out because it trades away part
of the streaming behaviour the route is built around, and that is a product call
rather than a security one.

## What to carry forward

Any future route that runs a query outside `lib/user-words/` inherits exactly
the ordering described above — which is why the fix is a convention (guard the
render path ahead of dictionary work), not a one-off patch. See the follow-up
spec and the Architecture section of `AGENTS.md`.
