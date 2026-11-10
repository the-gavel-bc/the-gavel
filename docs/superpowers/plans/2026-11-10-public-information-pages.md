# Phase 5 Task 19 — public information pages

> **For agentic workers:** Use superpowers:executing-plans for this approved slice. Keep decisions and verification here.

**Goal:** Publish honest About and How to Submit pages from approved site settings, usable without JavaScript.

**Architecture:** Two thin Server Component routes reuse the existing request-cached anonymous public site reader. A feature-owned prose component renders only the checked public information fields, with readable paragraph spacing, configured contact links, and distinct missing/unavailable states.

**Stack/spec:** Existing Next.js, React, TypeScript, CSS Modules, Vitest and Playwright. Implements [Task 19](2026-11-09-phase-five-public-reader.md#task-19--about-and-submission-instructions), preserving the [public reader contract](2026-11-09-phase-five-reader-contract.md).

## Baseline and scope

Branch `feat/public-information-pages` reuses the clean isolated `/private/tmp/the-gavel-phase5-task17` worktree, starting at Task 18 `38c133d`. Main is `711228a`; #65/#66/#67 remain prerequisites while open. Do not change the primary checkout, user screenshots or working database. Existing Task 18 framework 404 recovery limitation remains a release blocker.

Reuse checked settings rather than duplicating validation or adding an RPC/editor. A client fetch adds no useful interaction; a new content model or imported demo history would exceed this task. The demo contributes a centered prose layout, serif headings and readable measure only. No approved history/staff text exists in the settings contract, so omit those sections and keep their copy as a launch input gate.

## Acceptance and risks

- `/about` renders only `mission`; `/letters/how-to-submit` renders only `submissionInstructions`, with shared valid configured email/Instagram. React escapes all plain text. Split blank-line-delimited paragraphs and preserve single newlines; do not parse HTML/Markdown or invent links inside copy.
- Reuse the cookie-free no-store public reader and its request-local cache across layout/page/metadata. No session, service key, private settings, body, version or receipt enters these pages. SQL/public reader owns safety/length/link validation; do not create a second policy in presentation.
- Missing approved copy has a truthful message, not demo content. Backend unavailable has generic feedback and manual retry; do not confuse it with unset copy. Noindex unavailable or missing primary copy; complete pages use basic titles, with canonical/SEO work remaining Task 20.
- Contact and Instagram appear only when present in validated information. Encode the full mailto address, including reserved local-part characters. Do not invent contact email, publication year, staff/history, intake promises, policies, external providers, forms or newsletter signup.
- Preserve existing reader tokens, one shell/main, h1/h2 structure, native links, visible focus and 44px link targets. Long paragraphs/URLs must wrap at 320px. No client directive, dependency, migration, grant or persistent cache.
- This is read-only; no mutation races/retries/conflicts are added. Retry refreshes current settings. Copy/history/branding, human visual/screen-reader review and existing operational gates remain explicit.

## Files and steps

1. `src/frontend/features/reader/components/site-information/`: prose, headings, contact links, missing/unavailable states and colocated CSS/tests. Routes supply checked data and `page: "about" | "submission"`.
   - [x] Write focused tests for multi-paragraph/single-line breaks, literal HTML-looking text, long copy, valid encoded contact/Instagram, unset fields and unavailable output; observe failure.
   - [x] Implement minimal presentation, run focused checks and commit.
2. `src/app/(public)/about/page.tsx` and `letters/how-to-submit/page.tsx`, with colocated route tests.
   - [x] Test existing checked reader reuse, correct fields/titles, unavailable/unset noindex and native retry. Observe failure, implement thin routes and run affected checks.
3. `e2e/public-information/`: desktop/mobile native navigation and no-JavaScript checks, populated/missing/unsafe settings and safe-link assertions. Use an isolated scratch project; any synthetic singleton settings are restored. No working-project reset/migration.
   - [x] Run fast checks during work. Before PR run focused browser journeys/build, types, lint, format and relevant units once. No full SQL/concurrency rerun: the existing boundary is unchanged.
   - [x] Review once, update this plan/phase checklist/STATUS and component ownership docs, commit small slices and open a draft PR explicitly targeting main with pending dependencies. Owner monitors CI. Stop before Task 20.

## Verification

Implemented. Unprovided production mission/submission/contact and history/staff copy remain launch input gates; synthetic test text is not production approval.


- Focused baseline: eight existing reader/header tests passed. New prose/route tests failed before implementation and then passed. Final focused command `pnpm exec vitest run src/frontend/features/reader/components/site-information/site-information.test.tsx 'src/app/(public)/about/page.test.tsx' src/backend/public-site/public-site-navigation/public-site-navigation.test.ts src/frontend/components/site/site-header/site-header.test.tsx scripts/import-boundaries/import-boundaries.test.mjs` passed 31 tests across five files, including the unchanged checked-reader rejection and import-boundary coverage.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `git diff --check` passed. A production `pnpm build` completed as part of the browser run. No full unit/SQL/concurrency suite was repeated for these presentation-only changes; the public data boundary, SQL and generated types are unchanged.
- `INFORMATION_BROWSER_WORKDIR=/private/tmp/gavel-task19-browser pnpm exec playwright test --config playwright.task19.config.ts` passed four desktop/mobile cases with JavaScript disabled. These verify native About/submission navigation, 200/no-store responses, one main, visible keyboard focus, paragraph breaks, encoded mail/Instagram links, 3,200-character unbroken copy at 320px, unset/noindex feedback and unsafe stored fields being hidden by the real SQL/public reader. Synthetic singleton settings were confined to the scratch database, restored in finally, and compared with the complete original row.
- The dedicated project used current migrations on API57321/DB57322, one browser worker, and temporary local config. Normal CI runs the native-navigation cases through `pnpm exec playwright test e2e/public-information`; singleton fixture mutation is declared only when the exact scratch environment is selected. No working database or shared CI settings are reset by those fixtures.
- One fresh agent review found no actionable issues. No screenshots were needed. Human visual/screen-reader review, production copy/branding and hosted gates remain pending. Task 18's owner-approved upstream resource-404 no-JavaScript release blocker remains unchanged; Task 19 introduces no notFound handling or framework changes.

The two small route adapters have one colocated cross-route test file under About, avoiding duplicate setup. This does not add a new shared backend layer or duplicate settings validation. Basic titles/noindex are included here; canonical/social metadata remains Task 20.

Final post-build strict types, targeted formatting and diff checks passed. The scratch project was stopped with `supabase stop --workdir /private/tmp/gavel-task19-browser --no-backup`; working-project services were untouched. Temporary browser configuration is retained only outside the repository at `/private/tmp/gavel-task19-playwright.config.ts`.
