# Phase 5 Task 21 — sitemap and robots

> Keep decisions and evidence here. Spec: [Task 21](2026-11-09-phase-five-public-reader.md#task-21--sitemap-and-robots), [reader contract](2026-11-09-phase-five-reader-contract.md#media-responses-and-metadata), [Task 20 metadata](2026-11-10-public-page-metadata.md).

**Goal:** Publish a fresh `/sitemap.xml` of canonical, non-empty public pages and a `/robots.txt` that steers polite crawlers away from private, auth, API and search paths.

**Architecture:** One narrow, budgeted anonymous SQL projection (`list_public_sitemap_articles`) returns article identifiers with their archive slugs, using the existing published-visibility predicates. A server-only backend reader derives archive URLs from those articles and reads copy flags from site navigation. A `/sitemap.xml` route handler and a `robots.ts` metadata route render the output; both are request-time and the sitemap is never cached. (The original two-RPC metadata-route design was replaced after review; see the verification record.) No new service, grant on tables, or environment variable.

## Baseline and decisions

Branch `feat/public-sitemap-robots` from main `9269c86` (PRs #65–#69 merged; main CI green). Primary checkout; untracked `screenshots/` are Task 22 inputs and stay untouched.

Owner decisions (2026-11-11):

- List tag and author archives only when they have at least one currently visible published article. Apply the same rule to sections and categories. The sitemap is a subset of Task 20's indexable pages.
- `robots.txt` disallows `/search` so crawlers do not spend the shared database-wide search budget. Robots is advisory and is not access control.
- Article `<lastmod>` uses `published_at`. No `updated_at` or other edit timing is exposed. Archive pages carry no `<lastmod>`.
- One `robots.txt` in every environment. Previews rely on existing Vercel protection; no `VERCEL_ENV` dependency.

Technical defaults:

- Visible article = `status = 'published'`, active section and active owner profile, matching `list_public_articles`. Categories require an active category in the article's section. Authors are active owners or active credited contributors on a visible article, matching the author archive scope.
- The approved letters section ("Letter to the Editor", resolved by name as in `getPublicArchive`) is listed as `/letters` instead of `/sections/<slug>`. Static entries: `/` always; `/about` and `/letters/how-to-submit` only when their primary copy is configured, matching Task 20's index rules.
- Articles are read in keyset pages of up to 1,000 by `(published_at desc, id desc)` using the existing partial recent index. Per-article category/tag/author lists are capped at 64; exceeding that is `unavailable`. The whole sitemap is capped at the 50,000-URL protocol limit; exceeding it fails closed rather than silently truncating. Splitting with `generateSitemaps` is deferred until the catalog nears that size.
- Sitemap failures return a generic server error with no internal detail and are never cached.

## Acceptance and design risks

- Only published, visible content appears. Draft, archived, deleted, inactive-section, inactive-owner and empty archives are absent. Anonymous and authenticated calls return identical results. No table grants change.
- Archive/delete removes the URL on the next request; restore brings it back. Response is `Cache-Control: no-store` or equivalent non-persistent.
- URLs use validated `SITE_URL`, never request Host headers. No duplicates (letters vs section; repeated credits/tags).
- Pagination is keyset and bounded; equal timestamps break ties by id without skipping or repeating rows.
- Robots allows `/` and `/api/public/` (published images) and disallows `/dashboard`, `/auth`, `/sign-in`, `/access-pending`, `/search` and other `/api/` paths. It names the sitemap URL.

## File map and execution

1. `supabase/migrations/20261111010000_public_sitemap.sql`, `supabase/tests/047_public_sitemap.test.sql`.
   - [x] Failing pgTAP tests for grants, visibility, emptiness, dedup, keyset ties and bounds; implement both functions; db reset, `test:db`, db lint, regenerate types.
2. `src/backend/reader/public-sitemap/`: reader composing the projections and navigation into sitemap entries, with unit tests.
   - [x] Failing tests for static/letters rules, paging, cap, unavailable states and origin; implement.
3. `src/app/sitemap.ts`, `src/app/robots.ts`, focused route tests; production-build header check.
   - [x] Implement; verify headers and output against a production build with synthetic data.
4. Docs: API contract, security note, this record, phase checklist, STATUS.

## Verification record

Implemented. Local checks only; hosted CI and human review are pending. A disposable Supabase project (`/private/tmp/gavel-task21-db`, ports 58421/58422, symlinked migrations/tests) was used; the primary local project was not reset.

- `047_public_sitemap.test.sql`: 30 assertions passed. They cover grants, draft/archived/inactive-section/inactive-owner exclusion, empty/inactive section/category/tag/author exclusion, repeated credit/tag dedup, microsecond ordering, uuid tie-breaks, keyset continuation, page bounds, partial cursors and anonymous/authenticated parity. The tests and migration were applied together, so no failing run before implementation is claimed for SQL.
- Full `supabase test db`: 61 files, 1,899 assertions passed. `supabase db lint`: no schema errors. Types were regenerated from the disposable DB; the diff is only the two new functions.
- Reader/route unit tests failed before implementation (module missing), then passed. Full unit suite: 849 tests in 132 files passed with `--maxWorkers=2`. `pnpm format:check`, `pnpm typecheck` and `pnpm lint` passed.
- Robots tests use longest-prefix matching and assert `/authors/...` is not blocked by the `/auth/` rule.
- Production build (`pnpm build`, Next.js 16.4.2): `/sitemap.xml` dynamic, `/robots.txt` static. Against `next start` with synthetic rows: forged `Host`/`X-Forwarded-Host` did not change URLs; draft absent; letters section served as `/letters`; microsecond `lastmod`. Metadata routes default to `public, max-age=0, must-revalidate`, so a `next.config.ts` header now sets the same `private, no-cache, no-store` value public pages use; confirmed on the built server. Archiving the only article on a tag/guest/section removed all four URLs on the next request; restoring brought them back. Stopping PostgREST returned a generic 500 with `no-store` and no internal detail; recovery returned 200.
- Not run: draft-contract/editor/concurrency suites and the Playwright browser suite. Neither the editor nor the existing grants changed; sitemap/robots are non-HTML and were checked with HTTP requests. Task 23 owns integrated browser and hosted verification.

Review (high-effort pass, one round) and fixes:

- Fixed: published articles with legacy NULL bodies render unavailable/noindex, so the sitemap now excludes them (`content is not null`). Writes already validate non-null bodies; the per-row full document check is not repeated. Archive sets still mirror list pages, which show those cards.
- Fixed: archive sets used correlated probes of an unindexed CTE (entities × articles). They now use DISTINCT joins from visible articles, reading each one once.
- Fixed: `robots.txt` was prerendered with the build-time `SITE_URL`. It now renders per request; a build made with one origin and served with another advertised the runtime sitemap URL.
- Fixed (follow-up): a navigation failure no longer fails the sitemap. It omits About/how-to-submit and lists the letters section at its section path. The sitemap reuses the exported public card slug and timestamp schemas instead of copies.
- Fixed (production follow-up): consistent reads. The separate archive RPC is removed. Each article row carries its section, category, tag and author slugs, and archive URLs are derived from the listed articles, so no listed archive can be empty within one response. This also removes the full archive scan.
- Fixed (production follow-up): throttling. `private.claim_public_sitemap_budget()` admits 300 page reads per minute across all callers, using the search budget's sequence/advisory-lock pattern with its own key. The route returns 503 with `Retry-After` when it is spent; direct RPC calls get `rate_limited`. `/sitemap.xml` is now a route handler that writes escaped XML and its own `no-store` headers, replacing the metadata route and the `next.config.ts` header override. The budget is a tunable default. Shared starvation is the accepted tradeoff, as for search.
- Not changed: the per-reader slug/timestamp schemas elsewhere still follow the existing pattern; only the sitemap reuses the exported card schemas.
- After fixes, on a clean reset of the disposable DB: 047 passes (a NULL-body published fixture is now asserted absent); full SQL suite 61 files / 1,899 assertions passed; db lint is clean; generated types match. The app and reader suites (146 tests), typecheck and lint passed. Production build shows `/robots.txt` and `/sitemap.xml` as dynamic.

Remaining: production-origin and CDN header checks, human review, and the existing Task 18 no-JavaScript resource-404 blocker.

Production follow-up verification (clean disposable DB reset before and after): 047 passes, including a 300-admitted/301-denied budget window, rollover, no tickets for invalid input, and per-item archive slugs. Full SQL suite 61 files / 1,902 assertions passed; db lint is clean; types regenerated, with the diff limited to the article function. 184 app/reader/article tests, typecheck and lint passed. On the production build: escaped XML with `no-store`; forged Host ignored; NULL-body article excluded; archive removed the article and its now-empty tag/guest/section on the next request, and restore re-added them; a spent budget gave 503 `Retry-After: 51` on the route and `rate_limited` on a direct anonymous RPC; a PostgREST outage gave a generic 503.
