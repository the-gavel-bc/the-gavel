# Phase 5 Task 21 — sitemap and robots

> Keep decisions and evidence here. Spec: [Task 21](2026-11-09-phase-five-public-reader.md#task-21--sitemap-and-robots), [reader contract](2026-11-09-phase-five-reader-contract.md#media-responses-and-metadata), [Task 20 metadata](2026-11-10-public-page-metadata.md).

**Goal:** Publish a fresh `/sitemap.xml` of canonical, non-empty public pages and a `/robots.txt` that steers polite crawlers away from private, auth, API and search paths.

**Architecture:** Two narrow anonymous SQL projections (`list_public_sitemap_articles`, `list_public_sitemap_archives`) that reuse the existing published-visibility predicates. A server-only backend reader composes them with the existing site-navigation reader. Next.js `sitemap.ts`/`robots.ts` metadata routes render the output; the sitemap is request-time and never cached. No new service, grant on tables, or environment variable.

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
- Articles are read in keyset pages of up to 1,000 by `(published_at desc, id desc)` using the existing partial recent index. Archive sets return at most 5,000 entries per kind; exceeding that is `unavailable`. The whole sitemap is capped at the 50,000-URL protocol limit; exceeding it fails closed rather than silently truncating. Splitting with `generateSitemaps` is deferred until the catalog nears that size.
- Sitemap failures return a generic server error with no internal detail and are never cached.

## Acceptance and design risks

- Only published, visible content appears. Draft, archived, deleted, inactive-section, inactive-owner and empty archives are absent. Anonymous and authenticated calls return identical results. No table grants change.
- Archive/delete removes the URL on the next request; restore brings it back. Response is `Cache-Control: no-store` or equivalent non-persistent.
- URLs use validated `SITE_URL`, never request Host headers. No duplicates (letters vs section; repeated credits/tags).
- Pagination is keyset and bounded; equal timestamps break ties by id without skipping or repeating rows.
- Robots allows `/` and `/api/public/` (published images) and disallows `/dashboard`, `/auth`, `/sign-in`, `/access-pending`, `/search` and other `/api/` paths. It names the sitemap URL.

## File map and execution

1. `supabase/migrations/20261111010000_public_sitemap.sql`, `supabase/tests/047_public_sitemap.test.sql`.
   - [ ] Failing pgTAP tests for grants, visibility, emptiness, dedup, keyset ties and bounds; implement both functions; db reset, `test:db`, db lint, regenerate types.
2. `src/backend/reader/public-sitemap/`: reader composing the projections and navigation into sitemap entries, with unit tests.
   - [ ] Failing tests for static/letters rules, paging, cap, unavailable states and origin; implement.
3. `src/app/sitemap.ts`, `src/app/robots.ts`, focused route tests; production-build header check.
   - [ ] Implement; verify headers and output against a production build with synthetic data.
4. Docs: API contract, security note, this record, phase checklist, STATUS.

## Verification record

Pending.
