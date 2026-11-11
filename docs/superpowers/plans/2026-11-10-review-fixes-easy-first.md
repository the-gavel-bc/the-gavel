# Review fixes and optimizations implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` for inline implementation or `superpowers:subagent-driven-development` if delegated execution is selected. Execute one independently reviewed task at a time. Checkboxes record completed work, not intent.

**Goal:** Resolve small, well-understood review findings first, then make a measured request-count improvement without burying production blockers.

**Architecture:** Preserve current frontend/backend/shared boundaries, checked mutations, RLS and exact retry receipts. Use narrow component/validator fixes first. Reuse existing pending fixes instead of creating competing migrations or branches.

**Tech stack:** Existing Next.js, React, TypeScript, Vitest, Playwright and Supabase stack; Node 22 and pinned pnpm. No new dependencies or services.

**Spec:** [Cross-PR review](../../reviews/phase-1-5-pr-review.md), including its corrected findings and verification limits. This plan proposes implementation order only; it does not implement or approve changes to authentication, public URLs or content lifecycle.

## Scope and decisions

The user requested the easiest fixes and optimizations first. The recommended first tranche is four independent, small fixes (29, 12, 17, 14). The second tranche contains one pending-PR correction (27), then catalog deduplication (O1). This balances effort and concrete benefit; it is not severity order. Estimates below describe relative complexity, not promised duration.

Keep one focused PR per task, review each slice once before opening its PR, and record evidence here. A failed reproduction becomes a documented investigation rather than speculative code changes. No bulk feature branch or new general-purpose framework is needed.

## Constraints and execution preparation

- Current reviewed baseline: `9269c86`, branch `fix/media-upload-reliability`. Review documentation/reproduction scripts and unrelated `screenshots/` are uncommitted; preserve them. Do not switch/reset the shared checkout or sweep these files into a fix commit.
- Before execution, query current main/open PR heads and inspect existing worktrees. Create an isolated task branch/worktree from the correct current base. The recorded #70–#76 open status is historical, not a live merge guarantee.
- Read README and the task-relevant authoritative docs before editing: coding style, testing and development workflow; design system for UI; API/security contracts for server or access changes. Read architecture/component/data docs before the catalog composition change.
- Add no privileges and weaken no role/ownership checks. Do not cache private catalogs across requests, remove permanent cleanup records, change public URLs or rewrite applied migrations.
- Unit tests should reproduce the behavior rather than mirror implementation. Add parity cases for validator changes. Use focused browser checks only where browser behavior matters; skip screenshots unless investigating a visual issue.
- Run affected fast checks per task: focused Vitest, `pnpm typecheck`, targeted formatting and lint. Run relevant heavier suites once before its PR, then rerun only checks affected by subsequent fixes. Never reset the existing local database; use a disposable project if SQL proof is needed.
- Review reproductions currently assert that a bug exists. After a fix, add normal regression coverage and document the changed outcome; do not report an old snapshot reproduction as proof of the fixed application.

## Review focus and production gates

1. Successful unchanged saves must not leave controls disabled (Task 1).
2. UUID case normalization must reject duplicates without rewriting content or rejecting distinct assets (Task 2).
3. Escape must preserve desktop navigation and return focus correctly on mobile/nested disclosures (Task 3).
4. Correcting toolbar input must not clear a separate invalid-body failure (Task 4).
5. Catalog reuse must preserve user isolation, freshness and unavailable-selection repair (Task 6).

**Production hold points, independent of easy-first order:** resolve last-eligible-administrator counting (24) before merging/deploying the Google-only change; resolve cleanup capacity/fairness (1/28) before relying on that cleanup fix. Existing editor data-loss/recovery findings 5–7 remain important, and the matched-resource no-JavaScript 404 remains a recorded public-release blocker. Easy wins do not establish production readiness.

## Ordered tasks

### Task 1 — contributor unchanged-save recovery (finding 29; small)

**Branch:** `fix/contributor-noop-recovery`.

**Files:** modify `src/frontend/features/contributors/components/admin-contributors/contributor-controls.tsx`; create adjacent `contributor-controls.test.tsx`. Use `taxonomy-controls.tsx` as the existing no-op precedent. Public command/result interfaces remain unchanged.

- [ ] Add test `keeps contributor controls usable after an unchanged save`: return `ok:true,changed:false` with the same version; rerender the same contributor key; assert fields and Save are enabled, then edit and submit again.
- [ ] Run the new component suite and confirm the original behavior fails that assertion.
- [ ] Clear the success latch for unchanged saves. Preserve changed-save refresh behavior, pending-request exclusion and exact unavailable-response retries.
- [ ] Cover a changed save, unavailable response/retry, and forbidden response retaining local fields; inactive profiles must remain disabled.
- [ ] Run `pnpm exec vitest run src/frontend/features/contributors/components/admin-contributors/contributor-controls.test.tsx`, fast checks and the existing contributor action tests. Review once, record evidence and commit only this slice.

**Acceptance:** no-op saves do not require full reload; no SQL or authorization change. No browser/database suite is needed solely for this client-state correction unless focused checks reveal an integration concern.

### Task 2 — case-insensitive duplicate image IDs (finding 12; small)

**Branch:** `fix/body-image-uuid-parity`.

**Files:** modify `src/shared/articles/draft-contract/draft-contract.ts` and its adjacent tests; add a case to `src/shared/articles/draft-contract/draft-cases.json`, the existing parity fixture source.

- [ ] Add mixed-case duplicate UUID image nodes and assert rejection; add a single uppercase ID and two genuinely distinct IDs and assert acceptance.
- [ ] Run `pnpm exec vitest run src/shared/articles/draft-contract/draft-contract.test.ts` and confirm the duplicate case fails before the fix.
- [ ] Lowercase asset IDs only for membership in the duplicate-detection set. Preserve the supplied canonical document and existing UUID validation; SQL already normalizes comparisons.
- [ ] Run the focused suite and `pnpm test:draft-contract` against a disposable local database following the checker documentation; confirm TS/SQL parity rather than changing SQL to match the bug.
- [ ] Run fast checks, review once, record evidence and commit the slice.

**Acceptance:** mixed-case duplicates fail before dispatch; existing v1/v2 bounds and distinct-image behavior remain unchanged. No migration or stored-data rewrite.

### Task 3 — desktop Escape navigation (finding 17; small)

**Branch:** `fix/desktop-navigation-escape`.

**Files:** modify `src/frontend/components/site/reader-navigation/reader-navigation.tsx`; create adjacent `reader-navigation.test.tsx`; extend the existing reader-shell browser spec discovered at execution time.

- [ ] Add tests for Escape on the outer wide-screen menu, a nested disclosure and the narrow-screen menu; use the existing `45rem` breakpoint.
- [ ] Confirm the wide-screen outer-menu case fails on the original handler.
- [ ] Keep the outer wide-screen menu open; retain nested/mobile close behavior and focus return to the relevant summary. Keep server-rendered/no-JavaScript navigation expanded and usable.
- [ ] Run `pnpm exec vitest run src/frontend/components/site/reader-navigation/reader-navigation.test.tsx` and fast checks.
- [ ] Run one focused desktop/mobile keyboard browser check before the PR, including breakpoint changes; review once, record evidence and commit.

**Acceptance:** Escape cannot hide desktop primary navigation; nested/mobile disclosure behavior and focus remain accessible. No route or public URL changes.

### Task 4 — local link-field validation (finding 14; small)

**Branch:** `fix/toolbar-link-validation`.

**Files:** modify `src/frontend/features/articles/components/draft-toolbar/draft-toolbar.tsx` and `draft-toolbar.test.tsx`; extend `components/draft-form/draft-form.test.tsx` if needed to demonstrate unrelated editor-invalid state remains protected.

- [ ] Add tests that invalid toolbar URLs report a local field error without calling global body-invalid handling, cannot apply an unsafe link, and permit correction without an unrelated body edit.
- [ ] Run `pnpm exec vitest run src/frontend/features/articles/components/draft-toolbar/draft-toolbar.test.tsx` and confirm original behavior fails the new global-error assertion.
- [ ] Keep rejected URL feedback local to the existing toolbar field. Do not clear global editor failures to fix a local input problem. Preserve the current accepted URL predicate and actual editor-error channel.
- [ ] Test correction/clearing with no selected text and an independently invalid body; the latter must still block Save. Update existing assertions intentionally expecting toolbar input to invalidate the body.
- [ ] Run toolbar/form suites and fast checks; review once, record evidence and commit.

**Acceptance:** a rejected link never modifies content or poisons unrelated body validity. No expansion of the allowed URL contract.

### Task 5 — pending search input correction (finding 27; small, branch dependent)

**Target:** existing PR #71 if still open; otherwise a narrow follow-up from its merged version. Do not alter baseline `maxLength={320}` when the problematic change has not landed.

**Files:** `src/frontend/features/reader/components/search-form/search-form.tsx`, its existing tests, and the relevant public-search browser test.

- [ ] Recheck exact installed/pending behavior. Add a browser case for supplementary Unicode input within the 160-code-point normalized bound; include real searchable terms when testing SQL, not an emoji-only query.
- [ ] Retain the 320-code-unit input ceiling and existing canonical validation rather than adding a new client truncation algorithm. Test valid 160-BMP input and feedback above the normalized bound.
- [ ] Run focused search suites, fast checks and the focused browser case; review and update that task's evidence.

**Acceptance:** input can represent the supported Unicode range; SQL word and query bounds remain authoritative. If #71 has already been corrected, record no change rather than duplicating the fix.

### Task 6 — one catalog load per editor/recovery request (O1; medium)

**Branch:** `perf/deduplicate-editor-catalogs` after the small client fixes. This is the first optimization because duplicate request counts are observable without guessing at performance.

**Files to inspect/change:** `src/backend/articles/draft-queries/draft-queries.ts`, `draft-options/draft-options.ts`, `draft-reload-action/draft-reload-action.ts`, `src/app/(dashboard)/dashboard/articles/[id]/page.tsx`, and corresponding detail/reload/page tests.

- [ ] Record baseline catalog call counts for editable detail plus options and for recovery. Extend tests covering missing/inactive selections, forbidden access and two independent users/requests.
- [ ] Choose and document a server-only composition that returns detail with the already loaded options while keeping existing exported callers compatible. Decide its exact TypeScript interface before editing; do not expose options on public APIs or add persistent memoization.
- [ ] Update edit/recovery callers to share one authorized catalog load per logical request. Preserve independent server action authorization and backend boundaries.
- [ ] Verify one load per catalog (at least four fewer reads for the usual nonempty-section case), with pagination past 500 rows still correct. Missing/noneditable detail must not introduce unnecessary option reads.
- [ ] Run `pnpm exec vitest run src/backend/articles/draft-queries src/backend/articles/draft-reload-action src/backend/articles/draft-options`, affected route/form tests and fast checks. Run affected ownership-denial browser coverage once before the PR.
- [ ] Update `docs/api-contracts.md` only if an enduring server interface contract changes; record counts and unmeasured latency here. Review once and commit the slice.

**Acceptance:** deterministic duplicate reads removed; no cross-user/request reuse, broader read authority, removed repair information or weakened revocation checks. Stop and split a separate design if this requires broad query ownership changes.

## Reuse pending work and defer complex slices

| Queue                         | Findings / opportunities                | Treatment                                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing PRs first            | 4, 9, 15, 16 in #76; 8 in #71; 2 in #73 | Recheck head, merge status and regression evidence. Do not rebuild fixes in parallel. Finding 2 is defensive consistency work, not a demonstrated ordinary-admin outage.                                                                                  |
| Critical separate slice       | 3/24 in #75                             | Reconcile identity checks, targets, admin counts and locked trusted media. Requires security/authorization discussion before changing the model; retain the approved Google-only intent.                                                                  |
| Critical separate slice       | 1/28 in #74                             | Repair fairness while retaining tombstones and fencing. Requires multi-run/lease/late-write proof and hosted capacity checks; not an easy one-line patch.                                                                                                 |
| Editor/media follow-up        | 5, 6, 7, 13, 25, 26                     | Plan coherent but independently reviewable retry, conflict/status, field preservation and lock-order slices. Do not solve uncertainty by dropping receipts or force-overwriting newer versions.                                                           |
| Retention/resource follow-up  | 10, 11                                  | Upload admission and orphan recovery require resource budgets, late-write races and reference safety. Content-lifecycle changes need prior discussion.                                                                                                    |
| Verify behavior before fixing | 18, 19                                  | Confirm canonical-link scope and actual mail-client behavior. Encoding `@` alone is not runtime proof of a broken link. Shared helper/URL changes should follow the existing approved canonical contract, with discussion if public URL behavior changes. |
| Independent hardening         | 20 and planned browser controls         | Resolve immutable upstream references when executing; test CI. CSP/header work needs explicit deployment/editor/OAuth verification, not a blanket header patch.                                                                                           |
| Measure before implementing   | O2, O3, O4                              | Profile editor traversal; measure full-homepage footer work; inspect admin query plans. Each deserves its own small design after evidence justifies it.                                                                                                   |
| Later CI optimization         | O5                                      | Align build environments/artifact consumption before removing a build. Validate a real production build and browser run against the same artifact.                                                                                                        |
| Historical only               | 21–23                                   | Already fixed in the reviewed baseline; keep regression evidence, do not create new tasks.                                                                                                                                                                |

## Completion and handoff

Each task is complete only when its acceptance checks actually pass, affected role/ownership denials remain covered, its diff has one focused review, and evidence is recorded below. Fixes update the original finding's status with the exact commit/PR; “planned” never means “fixed.” Existing full-suite stalls remain a verification limitation until a successful integrated run establishes otherwise.

The original planning session changed documentation only. The user subsequently authorized all six ordered tasks and requested tests after implementation. The execution record below supersedes the original test sequencing. No PR creation or merge was requested.

## Decisions and verification notes

- Proposed order: 29, 12, 17, 14, pending correction 27, then O1. This is the planner's recommendation, not a claim that the user approved every technical choice.
- Plan checked against all findings 1–29 and opportunities O1–O5; high-risk changes remain separate named work rather than being hidden inside easy fixes.
- Planning verification: confirm referenced source paths exist, run targeted Markdown formatting and whitespace checks. No application test or performance result is created by writing this plan.

## Execution record

- User authorized all six ordered tasks and requested testing only after all fixes are implemented. This overrides the earlier per-task test sequence; regression cases are written alongside changes and executed in the final verification phase. No baseline test pass is claimed.
- Workspace: managed worktree `/Users/dylandrozario/.codex/worktrees/cc50/the-gavel`, branch `fix/review-easy-wins`, based on current main `895bd98`. PRs #70–#76 are now merged. The original checkout and its uncommitted review artifacts/screenshots are preserved.
- Ruling: deliver the six authorized tasks together locally, without creating or merging PRs. Task boundaries remain visible in this record; no repository history is rewritten.
- Ruling: the combined server read is `getDraftEditorData(articleId): Promise<DraftEditorData>`, where `DraftEditorData` carries `detail` and nullable `options`. Existing `getDraftDetail`, standalone options and browser recovery envelopes stay compatible. No persistent memoization or authorization change is introduced.
- Implementation: contributor no-op recovery, UUID comparison parity, desktop Escape, local toolbar errors, Unicode input capacity and shared catalogs are implemented. Final verification completed successfully as recorded below.

- Final-check correction: the new paste fixture needed `files: []`; both the focused run and independent reviewer identified it. Corrected the fixture and asserted the independent invalid-body state before toolbar interaction.
- Ruling: fix the merged #71 archive typo `letters(section)` to the existing `isLettersSection(section)`. TypeScript reported an undefined identifier in unchanged main code; this minimal correction is necessary to build and browser-test the approved search/UI changes. Existing public archive tests cover canonical behavior.

### Completed execution and verification

All six ordered tasks are implemented and locally verified. The original per-task checklist is retained as the planning snapshot; pre-implementation test runs and per-task commits were superseded by the user's end-only testing request and the recorded local-delivery decision.

| Task           | Status   | Evidence                                                                                                                                                                                                                    |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 / finding 29 | Complete | Unchanged contributor save remains editable after same-version refresh; exact uncertain retries, changed saves and forbidden/inactive cases covered.                                                                        |
| 2 / finding 12 | Complete | Mixed-case duplicate image IDs rejected; uppercase/distinct IDs preserved; shared TS/SQL fixtures pass.                                                                                                                     |
| 3 / finding 17 | Complete | Desktop menu remains open, mobile/nested Escape retains focus behavior; viewport changes and no-JS navigation checked.                                                                                                      |
| 4 / finding 14 | Complete | Toolbar errors are local and accessible; correction does not clear independently invalid native content.                                                                                                                    |
| 5 / finding 27 | Complete | Input restores 320 UTF-16 units; 160 supplementary code points survive native no-JS GET submission; over-bound ASCII queries get feedback.                                                                                  |
| 6 / O1         | Complete | Detail/recovery share one catalog read per invocation: five data requests instead of nine in the normal four-catalog case. Pagination, missing selections and separate-user freshness retained. No latency speedup claimed. |

Commands ran after all six implementations, under Node 22.20.0 / pnpm 11.25.0:

- `pnpm exec vitest run --maxWorkers=2 --testTimeout=20000`: **134 files / 885 tests passed**. The explicit timeout accommodates the previously observed import-boundary timing sensitivity; no default configuration was changed.
- `pnpm exec vitest run --config scripts/draft-contract-check/vitest.config.ts`: **217 cases passed**. This checker only selected and rolled back fixture expressions against the existing local synthetic database; no reset, migration or stored-data rewrite occurred. This read-only check replaced the plan's proposed disposable-project parity setup.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: **passed**. Targeted formatting also covers this plan and review artifacts outside the package formatter's normal paths.
- `pnpm exec playwright test e2e/reader-shell/reader-shell.spec.ts e2e/drafts/edit-drafts.spec.ts e2e/drafts/draft-conflict-recovery.spec.ts e2e/drafts/admin-contributors.spec.ts`: **30 desktop/mobile cases passed**, including owner/admin editing, author/credited/signed-out/ineligible denials, conflict recovery, no-JS navigation and Unicode submission. This command built and started the production app. Only documented fixed synthetic browser fixtures were used; the database was not reset.
- `git diff --check`: passed. Legacy browser specs regenerated two tracked screenshots; those images were restored byte-for-byte from the clean worktree base, so no screenshots are part of this deliverable.

The first focused run exposed the malformed paste fixture; it was corrected before the complete passing run. The first type check exposed the merged archive predicate typo; its narrow correction is included. The first build failed because Turbopack cannot resolve the initial cross-worktree dependency symlink. Installing the unchanged lockfile offline into this worktree resolved that environment issue; the subsequent production build/browser run passed.

Independent final review found no blocking implementation defects; its test-fixture finding was addressed and verified by the passing full suite. The initial handoff left changes local and uncommitted on `fix/review-easy-wins`. The user subsequently requested a PR to `main`, authorizing commits and publication; no merge was requested. Full browser, full SQL/RLS, concurrency, hosted CI and operational gates were not rerun because this slice changes no SQL or mutation authority; the recorded checks do not certify production readiness or resolve the deferred findings.
