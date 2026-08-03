# Deploy Strategy

**Date:** 2026-07-28
**Status:** Approved, ready for implementation planning

## Goal

Get jp-dict onto a public URL on Vercel, with local development no longer
pointed at the database that serves real users. Optimize for a single developer
shipping infrequently: the smallest setup that is safe, with the larger setup
written down as triggers rather than built now.

## Starting state

- Next.js 16.2.12, App Router, `cacheComponents: true` (PPR + `use cache`)
- Clerk auth via `proxy.ts`; authorization enforced in `lib/user-words/auth.ts`
- Neon Postgres via `@neondatabase/serverless` (HTTP driver) + Drizzle
- One Neon branch, `production` (`br-billowing-cake-a2812byn`), 444 MB,
  218,160 entries / 751,131 search terms, 2 migrations applied, 1 real user
- `.env.local` points at that same `production` branch
- GitHub repo `olekshyr/jp-dict`, no CI, no tests, no Vercel project

The single most important fact: **local development and production share one
database.** A `drizzle-kit push` or a bad local migration destroys real user
data today. Fixing that is part of deploying, not a follow-up.

## Decisions

| Decision | Choice |
|---|---|
| Platform | Vercel |
| Ambition | Ship simple, grow into it |
| Dev/prod database split | Neon child branch for dev |
| Migrations | Manual, gated before merge |
| CI | Minimal: lint + typecheck on PRs |

Rejected: Cloudflare/self-host (Next 16 `cacheComponents` support is unverified
outside Vercel); a separate Neon project for dev (forces a full re-import of
~93 MB of source data and doubles storage); running migrations inside the Vercel
build (a failing migration takes the deploy down and concurrent builds can race);
per-PR ephemeral Neon branches (real value, but ceremony at the current merge
rate — see Growth triggers).

## 1. Environment topology

| Environment | Neon branch | Clerk instance | Vercel scope |
|---|---|---|---|
| Production | `production` (existing) | dev instance | Production |
| Preview (PRs) | `dev` (new) | dev instance | Preview |
| Local | `dev` | dev instance | Development |

`dev` is created as a child of `production`. Neon branches are copy-on-write, so
this is instant, costs no additional storage, and yields the full dictionary plus
a snapshot of user data to develop against — no re-import.

After creating it, `.env.local` is repointed at `dev`. Nothing on a developer
machine holds a production connection string.

One Clerk **development** instance serves all three environments. A Clerk
production instance requires DNS records on a domain you own and therefore
cannot run on `*.vercel.app`; it arrives with the custom domain, not before.
The consequences of staying on a dev instance are accepted deliberately:
Clerk's development banner is visible, shared OAuth credentials are used, and
user volume is capped.

## 2. The build requires a live database

`app/(app)/entry/[id]/page.tsx:28` exports `generateStaticParams()`, which calls
`getCommonEntryIds(2000)`. Every Vercel build therefore issues thousands of
dictionary queries before it can produce output. This drives three requirements:

- `DATABASE_URL` must be present in Vercel's **Production and Preview** scopes.
  It is a build-time dependency, not merely a runtime one: `lib/db/client.ts:12`
  throws at module evaluation when it is unset, so a missing value fails the
  build rather than the request.
- Builds wake the Neon compute and take meaningfully longer than a
  database-free Next build. On Neon's free tier a scale-to-zero cold start is
  absorbed by the build, not by a user.
- If build duration becomes a problem, the knob is the `2000` argument to
  `getCommonEntryIds`. The caching design is not the problem and should not be
  changed to address build time.

## 3. Environment variables

`.env.example` is out of date and must be corrected first, because it is the
checklist used to populate Vercel's dashboard. `.env.local` contains four keys
absent from it:

- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
- `NEON_BRANCH`
- `DATABASE_URL_UNPOOLED`

`DATABASE_URL_UNPOOLED` is read by no code in the repository
(`grep 'process\.env\.' app lib scripts *.ts` returns only `DATABASE_URL`).
**Decision: wire it up rather than delete it.** `drizzle.config.ts` prefers it
and falls back to `DATABASE_URL`:

```ts
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
```

`drizzle-kit migrate` takes advisory locks that belong on a direct connection
rather than through a pooler, where a pooler may hand successive statements to
different backends. The app itself continues to use the pooled `DATABASE_URL`.

Both keys are added to `.env.example`, along with the two Clerk fallback
redirect URLs.

Full set to configure in Vercel (Production + Preview):

| Variable | Production value | Preview value |
|---|---|---|
| `DATABASE_URL` | `production` branch pooled URL | `dev` branch pooled URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | dev instance `pk_test_…` | same |
| `CLERK_SECRET_KEY` | dev instance `sk_test_…` | same |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | same |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | same |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | copy from `.env.local` | same |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | copy from `.env.local` | same |

`NEON_BRANCH` is a local convenience marker and is not set in Vercel.

## 4. Migration workflow

Migrations are applied by hand, in this order, every time:

1. Edit `lib/db/schema.ts`
2. `pnpm db:generate` — commit the generated SQL alongside the schema change
3. `pnpm db:migrate` against `dev`; verify locally
4. Open a PR; the preview deploy builds against the already-migrated `dev`
5. **Before merging:** run `pnpm db:migrate` against `production`
6. Merge; Vercel deploys

Step 5 precedes step 6 because new code must never reach production ahead of the
schema it depends on.

Targeting production is done by overriding the variable inline. Per section 3
`drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` first, so that is the variable
to override — pass the **direct** (unpooled) production string, not the pooled
one:

```bash
DATABASE_URL_UNPOOLED='<production direct connection string>' pnpm db:migrate
```

This works because `drizzle.config.ts:4` calls dotenv's `config()` without
`override: true`, so a value already in the environment wins over `.env.local`.

**Migrations must be additive.** Add columns as nullable, backfill, and only
then constrain — in separate deploys. During any deploy the old and new code
run concurrently against one schema, so a migration that drops or renames a
column in use breaks live requests. The existing `userWords` SRS columns
(`dueAt`, `intervalDays`, `ease`, `repetitions`, `lapses`) are the pattern to
follow: nullable from day one, so the feature lands without a migration.

`drizzle-kit push` is never run against `production`. It diffs and applies
without a migration file, which is precisely the operation that has no review
step.

## 5. CI

One GitHub Actions workflow, triggered on pull requests only:

```
checkout → pnpm install --frozen-lockfile → pnpm lint → pnpm typecheck
```

No secrets, no build step — Vercel's preview deploy is the build, and
duplicating it would need `DATABASE_URL` in GitHub for the reasons in section 2.

This workflow exists specifically because **Next.js 16 removed `next lint` and
the `eslint` option in `next.config.js`**
(`node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md:122`).
`next build` no longer runs ESLint at all, so without this job lint violations
reach production unnoticed. TypeScript errors still fail `next build`, but
`pnpm typecheck` is included anyway so the signal arrives without waiting on a
full build.

## 6. Dictionary re-import runbook

`data/` is gitignored (60 MB `JMdict_e.xml`, 33 MB `JmdictFurigana.json`) and is
never present in CI or on Vercel. Re-importing a newer JMdict release is a local
operation, and it is the only routine operation that rewrites production data,
so it is written down:

1. Download the current `JMdict_e.xml` and `JmdictFurigana.json` into `data/`
2. Create a scratch Neon branch off `production`
3. `DATABASE_URL='<scratch branch>' pnpm db:import`
4. `DATABASE_URL='<scratch branch>' pnpm tsx scripts/verify-import.ts` — confirm
   every check reports OK: senses missing `pos` under 5%, prefix search reaching
   an index scan rather than a Seq Scan, and each documented search path
   resolving 猫 (entry 1467640)
5. Promote the scratch branch, or repeat step 3 against `production` once the
   scratch run has proven clean

`scripts/db-check.ts` is the connectivity and extension smoke test (it verifies
`pg_trgm` is installed, which `search_terms_trgm_idx` depends on) and should be
run against any newly created branch.

The importer uses a plain `pg` TCP connection rather than the app's neon-http
driver, so it needs a direct connection string, not the pooled one.

## 7. Growth triggers

Deliberately not built now. Each has a condition that says when to build it.

| Trigger | Action |
|---|---|
| You want a custom domain | Register it, add it in Vercel, then create a Clerk **production** instance: add its DNS records, supply your own Google OAuth credentials, and swap Vercel's Production scope to `pk_live_`/`sk_live_`. Preview stays on the dev instance. Existing dev-instance users do not carry over. |
| PRs are merging regularly | Install Neon's Vercel integration for an ephemeral branch per PR, replacing the shared `dev` branch for previews. |
| Cold starts are noticeable | Move Neon off the free tier and disable scale-to-zero on `production`. |
| The app gets tests | Add them to the CI workflow from section 5. |

## Out of scope

Operational hardening (observability and edge traffic controls), a staging
environment distinct from preview, database backups beyond Neon's built-in
instant restore, and the SRS scheduling feature the `userWords` columns
anticipate.

## Success criteria

1. `https://<project>.vercel.app` serves the app; sign-in, search, save, and
   review all work against the `production` branch.
2. `.env.local` points at `dev`. No production connection string exists on a
   developer machine.
3. A pull request produces a preview deploy that reads and writes `dev`, and
   leaves `production` untouched.
4. Opening a PR with a lint error fails CI.
5. `docs/` contains the migration and re-import runbooks, such that a schema
   change can be shipped by following them without re-deriving any of this.
