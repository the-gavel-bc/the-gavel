# Phase 5 Task 18 — search page and not-found recovery

**Current decision:** The owner accepted the [bounded resource-404 deferral](2026-11-11-resource-404-framework-fix.md#accepted-deferral--owner-decision-2026-11-11) after the stable-upgrade experiment. It supersedes the release-blocker classification in the historical implementation/investigation record below. The defect and expected-failure assertion remain; all other launch gates still apply.

> **For agentic workers:** Use superpowers:executing-plans. Keep this task's decisions and verification here.

**Goal:** Let readers search published stories and recover from missing URLs with native forms and links, including without JavaScript.

**Architecture:** A force-dynamic public `/search` Server Component calls Task 17's checked anonymous reader. Presentation reuses the card grid and pagination. One labeled GET form serves search, navigation and recovery. Root and public resource not-found boundaries share recovery content; the root fallback supplies its own static public shell.

**Tech stack:** Existing Next.js, React, TypeScript, CSS Modules, Supabase, Vitest and Playwright; no dependencies or migrations.

**Spec:** [Task 18](2026-11-09-phase-five-public-reader.md#task-18--search-page-and-custom-not-found-recovery), [reader contract](2026-11-09-phase-five-reader-contract.md#pagination-and-search), [Task 17](2026-11-10-bounded-public-search.md).

## Baseline and decisions

Reuse the clean isolated `/private/tmp/the-gavel-phase5-task17` worktree on new branch `feat/public-search-page`, based on Task 17 `fb0fc3d`. Main is `711228a`; prerequisite PRs #65/#66 are open. Preserve both prerequisites and target main with dependencies explicit. The stale primary checkout and user screenshots are untouched.

The approved server-rendered GET approach fits shareable URLs and no-JavaScript use. A client suggestion interface adds unrequested behavior; a new GET API duplicates the existing checked reader. The demo's 404 provides a concise heading, explanation and home link; adapt that into existing reader tokens with an inline labeled search, without importing its fonts, scripts or sample copy.

## Constraints and acceptance

- Query/cursor validation and all permission/quota rules remain Task 17's authority. Reject repeated `q`/`cursor` values before calling it. Missing/blank queries show instructions without spending quota; malformed queries/cursors show safe correction guidance. Retain bounded query text as escaped React text/input values. No client corpus, HTML highlights, counts beyond the displayed page, relevance claims or live suggestions.
- Show distinct prompt, result, empty/final-page, invalid, unavailable and throttled states. A fresh form submission drops old cursors. Pagination encodes both canonical query and opaque cursor. Continuations offer a newest-results link. Throttling displays the server's bounded seconds and a manual retry; never auto-poll or invent per-user limits. Failures retain query/cursor for manual retry where valid. Search metadata is always noindex and contains no raw query.
- Call the anonymous reader once from the page, not metadata. Keep search links' prefetch disabled: speculative reads must not consume quota. No persistent caching; response/browser proof must observe no-store. No cross-page snapshot guarantee; existing cursor rules handle current editorial state.
- Reuse existing ArticleGrid/Card/Pagination and reader tokens. Native forms have persistent labels, clear help/errors, unique IDs, 44px controls and visible focus. Desktop/mobile/320px text wrapping must not overflow. Avoid adding use-client to presentation; existing navigation remains client-owned.
- Missing/draft/archived/deleted resource URLs remain indistinguishable real HTTP 404s with recovery search/home. Preserve existing article/archive headings for compatibility. Do not redirect or add loading/Suspense boundaries that turn missing-resource responses into streamed 200s. Root fallback has one main landmark and no dependency on a working backend.
- No new URL policy, auth model, SQL grant, migration, service, media or architecture change. Retry is a read; write conflicts and cleanup races remain outside this slice. Human visual/screen-reader and hosted launch gates stay explicit.

## File map and execution

1. **Shared presentation** — `src/frontend/features/reader/components/search-form/` owns labeled GET form/styles/tests; navigation reuses it. `search-results/` owns checked state rendering and query/cursor links. Add optional prefetch control to existing `pagination/` without changing other consumers.
   - [x] Test native GET labels, literal queries, empty results, invalid input, throttling, and service failures. Check that pagination retains the query, a new search drops the cursor, and links skip prefetch. Observe the tests fail before implementation.
   - [x] Implement minimal presentation; run focused Vitest and commit.
2. **Route and recovery** — `src/app/(public)/search/page.tsx` and colocated tests own input shape, one read, static noindex metadata and state composition. `not-found-recovery/` supplies generic content. `src/app/not-found.tsx` supplies root shell; public route/group and existing resource boundaries reuse recovery without duplicate shells.
   - [x] Test blank/repeated/invalid inputs, exactly one checked read and no metadata read, query retention, and resource/root recovery; observe failure.
   - [x] Implement route/recovery, run affected route/component tests and commit.
3. **Browser and handoff** — `e2e/public-search/` owns bounded synthetic fixture setup/cleanup and desktop/mobile no-JavaScript journeys. Use an isolated scratch project for current migrations and quota manipulation; never reset/migrate the working database.
   - [x] Verify native submit/keyboard/focus, 12+1 pagination, query retention/escaping/cursor rejection, empty results, private/deleted 404s, unknown global URLs and recovery form. Check no-store/noindex and one ticket per page with no speculative pagination ticket. Cover throttle/retry and unavailable feedback through targeted component tests and real browser response where feasible.
   - [x] Run focused fast checks during edits; once before PR run affected browser journeys, build, types, lint, format and full units. No repeated full SQL/concurrency suite: no DB changes, and Task 17 already proved that boundary.
   - [x] Review completed slice once. Update this plan, phase checklist and STATUS; authoritative docs only for lasting interface changes. Commit small coherent changes and open draft PR explicitly targeting main, dependent on #66/#65. Owner watches hosted CI.

## Verification record

Search and recovery components are implemented. The owner approved leaving the framework unchanged and documenting matched-resource no-JavaScript recovery as a public-release blocker. Task 18 may hand off with this explicit limitation. Do not start Task 19.

### Framework recovery investigation

Browser proof found that matched missing-resource routes return HTTP 404 but an empty body with JavaScript disabled; unmatched root URLs render correctly. Direct HTML comparison showed the resource response uses Next's `__next_error__` shell and carries recovery only in Flight scripts. Moving `notFound()` out of metadata did not fix it; that hypothesis and its code/test changes were reverted. No framework config or dependency patch is retained.

Installed Next 16.4.2's `getErrorRSCPayload` builds the empty shell on SSR error recovery. This matches the primary upstream report [#100596](https://github.com/vercel/next.js/issues/100596), whose proposed framework fixes remain open. The owner chose to keep the framework unchanged and document matched-resource no-JavaScript recovery as a release blocker. No dependency patch or extra routing/database precheck is authorized. Retain the actual assertion as an explicitly expected failure, linked to the upstream issue; a framework fix must become an unexpected pass. A separate positive test asserts real 404 status and hydrated recovery for missing taxonomy, private, archived and deleted article URLs. Never claim no-JavaScript matched-resource recovery passes.

- Focused baseline: 13 tests passed. New presentation and route tests failed before implementation, then passed. The first build caught a displaced client directive from form extraction; it was restored before successful production runs.
- `pnpm exec vitest run --maxWorkers=2`: 774 passed, one unchanged import-boundary test exceeded its five-second timeout while build checks were running. No timeout was relaxed. The focused final rerun is recorded separately after completion; no clean full-unit invocation is claimed.
- `SEARCH_BROWSER_WORKDIR=/private/tmp/gavel-task18-browser pnpm exec playwright test --config playwright.task18.config.ts`: production build succeeded. Desktop/mobile native GET, no-JavaScript 12+1 pagination, query retention/reset, escaping, duplicate-parameter rejection and 320px overflow checks passed (four cases). Matched resource no-JavaScript recovery failed on both projects; the relevant assertions are retained. Unmatched-root initial HTML and HTTP 404 were independently verified by direct HTTP/browser inspection.
- After reverting the unsuccessful metadata experiment, `--grep 'one render'` passed both desktop/mobile cases: exactly one admitted ticket per rendered page, no speculative pagination ticket after hydration/viewport exposure, bounded throttle feedback and successful manual retry. Counter state and synthetic article fixtures were restored by the test. No working-project quota was reset.
- `pnpm lint`, `pnpm format:check` and strict types passed before the final documentation update; final checks are recorded below. One fresh read-only agent review reported no actionable findings. It did not prove framework behavior; the browser evidence above remains authoritative.
- No database migration, grant, source-data change, dependency update, framework patch or persistent cache was added. No SQL/concurrency suite was repeated. Human visual/screen-reader and hosted operational checks remain pending.
- Scratch browser setup used current migrations under `/private/tmp/gavel-task18-browser` (API57321/DB57322), one worker and production Next build/start. Its temporary Playwright configuration is retained outside the repository at `/private/tmp/gavel-task18-playwright.config.ts`; copy it into the worktree as `playwright.task18.config.ts` only for the dedicated local run. Normal CI uses `pnpm exec playwright test e2e/public-search` against its usual isolated test database and never runs the scratch-only quota reset case.

Final focused Vitest rerun passed all 52 tests across ten files, including the unchanged import-boundary suite and all affected public route/form/recovery cases. Strict types passed again. The broad unit invocation remains recorded above with its isolated timeout. The approved limitation is also listed in deployment's release gates; it is not treated as a successful no-JavaScript resource-recovery check.

Approved recovery verification (`--grep 'unmatched|missing,|resource 404'`, reusing the unchanged production build) completed successfully: four positive desktop/mobile cases passed, and two explicitly expected failures reproduced the upstream no-JavaScript resource bug. Positive checks separately cover unmatched-URL native recovery, actual 404 statuses, article/archive headings and hydrated forms across missing taxonomy, private, archived and deleted articles. Playwright labels the run six passed because the two failures are expected; they are not counted here as recovery successes. Together with the earlier four search and two quota cases, ten positive browser cases passed across the focused runs. No clean all-scenarios no-JavaScript recovery claim is made.

Final lint, full configured formatting and diff checks passed after the expected-failure classification. The scratch project was stopped with no backup after fixtures/counter restoration. No hosted CI was monitored.

Handoff: draft [PR #67](https://github.com/dylandrozario/the-gavel/pull/67) targets main and depends on open #66/#65. Task 19 is next; the approved framework recovery limitation remains a release blocker.
