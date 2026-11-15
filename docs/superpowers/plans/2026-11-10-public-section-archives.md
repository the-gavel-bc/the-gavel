# Phase 5 Task 13 — section, category and letters archives

Status: implemented and locally verified on `feat/public-section-archives`, based on Task 12 PR #61, which is still open. Target main; merge #61 first if it remains open.

## Scope, decisions and acceptance

- Implement `/sections/[sectionSlug]`, its nested `/categories/[categorySlug]`, and `/letters` as server-rendered archives. Preserve the single section dynamic-directory name and all existing reader/editorial behavior.
- Resolve active sections/categories from the checked anonymous navigation projection before listing. Equal category slugs in different sections stay distinct. Missing/inactive section or category returns real 404; catalog service failure stays unavailable/noindex. Metadata, layout and page reuse request-scoped reads only; no persistent cache or user session.
- `/letters` resolves the configured active section whose name matches the approved `Letter to the Editor` label (case-insensitive). Do not invent a database slug, insert taxonomy, use the demo category, or silently fall back to another section. Missing configuration returns generic unavailable/noindex, and deployment must provision the approved section. Link `/letters/how-to-submit`; that guidance page belongs to Task 19.
- Reuse the bounded public listing contract with limit 12 and scope-bound opaque cursors. Repeated/malformed/cross-scope cursors render safe invalid-page feedback with a native first-page recovery link and noindex. Never echo tokens or database errors. No mutations, retry receipts, or conflict state are introduced.
- A first-page section/letters archive promotes its first card to the existing hero and omits it from the grid. Category/continuation pages use the card grid. Show active category chips, breadcrumbs, real empty/final states and native Older articles links. A Newest articles link returns to page one; do not pretend to reconstruct an immediate previous cursor.
- Reads are live snapshots, not a frozen browsing session: concurrent publication/archive can change later pages. Existing SQL remains authoritative for public visibility, keyset ordering and scope isolation. No new SQL authorization/business rules, dependencies, schema or external services.
- Keep all content, recovery, links and pagination usable without JavaScript. Preserve reader-local styles, one page h1, visible focus, narrow reflow and server-only guards. No loading boundary before scope resolution, to preserve actual 404 status.

## Implementation and validation

1. Failing backend orchestration tests: active/empty/missing/failed catalog, nested scope disambiguation, cursor rejection/forwarding, letters mapping. Add focused component/route tests for lead exclusion, chips, metadata, errors and pagination.
2. Add request reuse to navigation; implement the archive resolver with the existing list adapter. Add shared archive header/chips/grid presentation and thin route entry points. Commit small coherent slices.
3. Run focused units/types/lint during build. Review the completed diff once. Run build/format, existing SQL list/navigation assertions and focused desktop/mobile browser proof once. Browser tests cover real 404, public-only lists, duplicate category slugs, pagination isolation/recovery, empty/final pages, owner parity and no-JavaScript reading.
4. Record commands/results and limitations here, update component ownership docs and STATUS, then open a main-targeting draft PR. Owner monitors hosted CI. Human visual/accessibility signoff and missing real taxonomy remain separate gates.

Rollback: revert application consumers and resolver; no migration or stored-data change is required.

## Verification record

- Backend and archive UI tests first failed because their implementation modules were missing; the first implementation passed twelve focused cases. Expanded route/query/navigation regression coverage passed 23 cases.
- `pnpm test --maxWorkers=2`: all 726 unit/component tests passed. `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `git diff --check` passed. Initial TypeScript checks identified a combined-union narrowing issue and an unsupported Testing Library option; both were corrected without weakening assertions.
- `pnpm exec supabase test db supabase/tests/036_public_article_list.test.sql supabase/tests/037_public_site_navigation.test.sql`: all 57 existing SQL assertions passed. No migrations, grant changes, generated-type changes or database reset were needed.
- `pnpm exec playwright test e2e/public-archives/public-archives.spec.ts`: all four desktop/mobile cases passed on the first run. Playwright built and started the production app. Checks covered twelve-card first pages, nonduplicated section lead, one-card final pages, equal category slugs in distinct parents, cross-scope/repeated cursor recovery and noindex, empty scopes, inactive/missing parent/child real 404, public-only owner views, native keyboard focus, 320px reflow and no-JavaScript pagination into a readable article. `/letters` displayed only its synthetic published letter from a deliberately non-guessed catalog slug and linked submission guidance.
- One fresh-context read-only review found no issues. Browser fixtures were removed by teardown; a scoped database count confirmed no archive fixtures remain. The app test server stopped after the suite. No hosted CI monitoring or screenshots were used.

Dependency installation initially hit sandbox DNS restrictions; the same frozen-lockfile install succeeded with network access. Human visual and screen-reader approval, real letters taxonomy configuration, later tag/author/search/information routes and complete SEO remain pending. Existing media and mutation concurrency boundaries were untouched, so their heavy suites were not repeated.
