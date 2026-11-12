# Resource 404 framework fix plan

> **For agentic workers:** After implementation is authorized, use `superpowers:executing-plans` task by task. Keep the prior no-patch decision until a replacement is explicitly selected.

**Status:** Stable-upgrade experiment completed; 16.4.6 does not fix the regression. Dependency/test changes were reverted. Framework backport remains unapproved.

**Goal:** Render the existing recovery heading, search form and Home link in initial HTML for missing public resources, with JavaScript disabled and a real HTTP 404.

**Architecture:** Prefer a verified stable Next.js patch release. If stable releases still reproduce the failure, prepare a separately reviewed, version-pinned upstream backport proposal; retain the release blocker until an implementation passes. Reuse existing anonymous reads and not-found components.

**Tech stack:** Next.js 16.4.2, React 19.3.0, Node 22, pnpm 11.25.0, existing Vitest and Playwright desktop/mobile projects.

**Spec:** [Existing Task 18 investigation and owner decision](2026-11-10-search-page-and-recovery.md#framework-recovery-investigation), [reader recovery requirement](2026-11-09-phase-five-public-reader.md#task-18--search-page-and-custom-not-found-recovery).

## Evidence and approaches

The recorded production reproduction returns the correct 404 status but puts recovery content in Flight scripts rather than visible HTML. Moving `notFound()` out of metadata was already tried and reverted. Installed Next's `getErrorRSCPayload` contains the `__next_error__` shell. This is the framework defect previously discovered, not a new application bug.

Upstream checked on 2026-11-11:

- [Issue #100596](https://github.com/vercel/next.js/issues/100596) remains open. Its report matches the production-versus-hydrated behavior recorded here.
- [PR #100648](https://github.com/vercel/next.js/pull/100648), head `495af9e1830ed5c54cbaf0f626d7114cc1b453aa`, and [PR #100606](https://github.com/vercel/next.js/pull/100606), head `07cbe60d4be93a0fcac8c2b0b974373489b4724d`, remain open and unmerged. Both change framework rendering internals; neither is an approved release fix.
- The latest stable release is [16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6), published November 9. Its notes do not claim this fix. It is a test candidate, not a demonstrated solution.
- Official [not-found documentation](https://nextjs.org/docs/app/api-reference/file-conventions/not-found) scopes `global-not-found` to unmatched URLs. Merely adding it does not establish a fix for an existing resource route calling `notFound()`.

**Preferred approach:** Reproduce on 16.4.2, test 16.4.6 in isolation, and use a stable upgrade only if the actual regression passes. Recheck release/fix status when execution starts.

**Fallback proposal:** If no stable release passes, assess a narrow upstream backport in an isolated experiment. The prior owner decision explicitly excluded framework patches and extra routing/database prechecks. This plan does not override that decision: present the exact patch, risks and regression results for an implementation decision before retaining it. If a safe backport cannot be demonstrated, keep the blocker and wait for an upstream release.

An application routing workaround is not selected: redirecting to a recovery route changes public URL behavior; returning recovery JSX can produce soft 200s; proxy visibility checks duplicate reads and introduce races. Any such redesign would require a separate contract discussion.

## Scope and review focus

- Preserve existing public paths, real 404 status, appropriate noindex metadata and current cache/privacy rules. Do not introduce a redirect, a soft 200 or a JavaScript-only fallback.
- Missing, draft, archived and deleted articles must remain indistinguishable, including for signed-in owners/administrators. No title, body or private existence data may enter HTML or Flight recovery payloads.
- Preserve valid article/archive/search rendering, private dashboard access, Server Actions, metadata and hydration. Existing service failures must remain unavailable states, not fabricated missing resources.
- Do not add loading/Suspense boundaries to conceal the failure; these can commit a 200 status before the resource is checked.
- Reuse the existing recovery component and semantic search form. Verify labels, one main landmark, keyboard focus and mobile reflow. Screenshots are unnecessary unless a layout defect appears.
- Preserve working data. A production browser stack needs isolated local Auth/Storage/API services; a cloned SQL database alone is insufficient. Reuse the documented browser fixtures and verified scratch setup without resetting the working project.

## Task 1 — establish a production acceptance gate

**Files:** `e2e/public-search/public-search.spec.ts`; existing fixture helpers only where necessary.

- [x] On an isolated branch from current main, record commit, Node/pnpm/Next versions and the existing expected-failure result under `next build`/`next start`. A development server result is insufficient.
- [ ] Replace the single draft-only probe with independent missing-resource cases covering unknown article, draft (fixture 14), archived (15), deleted (16), missing section/category/tag/author, and unmatched root URL. Test desktop/mobile with JavaScript disabled. A failure in one case must not prevent the remaining cases from running.
- [ ] Assert response status is 404 and the parsed visible body contains one main landmark, the correct Article/Archive recovery heading, labeled GET search and Home link. Searching raw response text is insufficient: Flight scripts already contain the missing UI.
- [ ] Check initial robots metadata and dynamic-resource privacy/cache behavior. Verify native recovery search and Home navigation, not only element presence. Retain a small hydrated equivalent and valid published/empty-archive controls.
- [ ] In the isolated candidate branch, run the actual assertions without `test.fail`. Record the failing cases on 16.4.2 before dependency changes. Keep the current release-blocker exception until a passing implementation is ready; do not merge a red test-only change alone.

Focused production command: `pnpm exec playwright test e2e/public-search/public-search.spec.ts --grep 'unmatched URLs|missing, private|resource 404'`. Keep these test names or update this command alongside their replacement. Do not spend/reset the global search quota to hide failures.

## Task 2 — test the stable upgrade first

**Files, only if successful:** `package.json`, `pnpm-lock.yaml`, the acceptance tests above. Keep `next` and `eslint-config-next` on the same exact patch version.

- [x] Recheck official issue, fix PRs and stable release notes. Test 16.4.6 first unless a newer verified stable fix has appeared; record the exact version and source. Do not infer inclusion from issue closure or release recency alone.
- [x] Change only the Next.js and matching ESLint package versions in the experiment, regenerate the lockfile, and build from a clean artifact state. Keep React and other dependencies unchanged unless their required compatibility would need a separate decision.
- [ ] Rerun Task 1 without expected-failure markers. If it still fails, discard this experiment's dependency/lockfile changes and record the result. Do not describe an unrelated upgrade as fixing the blocker.
- [ ] If it passes, retain the smallest upgrade diff and proceed to Task 4. Record a rollback to the original exact package/lockfile versions; rollback reopens the release blocker.

## Task 3 — backport assessment, only if Task 2 fails

**Files for a later proposal:** an exact-version `patches/next@<tested-version>.patch`, pnpm patch registration and lockfile, plus regression tests. The precise package target and diff must come from the experiment, not from an invented patch in this plan.

- [ ] Review both upstream candidates against the tested stable renderer. Account for nearest-boundary selection, nested layouts, root/document construction, metadata, retained Flight transport and existing client-navigation behavior. Their source targets canary; do not apply either blindly to a compiled distribution.
- [ ] Present a short backport proposal with the exact target/version, immutable upstream source, expected changed runtime paths and removal trigger. Obtain a new decision about retaining a framework patch; the earlier no-patch decision remains in effect.
- [ ] If that experiment is authorized, use pnpm's tracked package-patch mechanism. Never rely on an untracked `node_modules` edit. Cover every runtime variant actually used by production and prove frozen-lockfile installation applies the patch from scratch.
- [ ] Reject a backport that requires a broad renderer rewrite, loses segment-specific recovery, changes authorization/error semantics or fails the regression matrix. Do not weaken tests or replace the blocker with an assumed workaround.

## Task 4 — verify and hand off the selected fix

- [ ] Run Task 1's full 404 matrix with JavaScript off/on on desktop/mobile. Include anonymous and signed-in public requests, private/archived/deleted denial cases, valid pages, metadata, native search and unavailable recovery.
- [ ] Run targeted existing public recovery/route/metadata tests and dashboard auth/draft Server Action smoke cases. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `git diff --check`. Because the framework changes, run the full browser/production build gate once before the PR; record counts and expected failures honestly. CI retains all database/security gates. The production build belongs to the Playwright gate; do not add a second redundant build.
      Focused component/route command: `pnpm exec vitest run src/frontend/features/reader/components/not-found-recovery src/frontend/features/reader/components/search-form 'src/app/(public)/articles/[slug]' src/backend/reader/public-metadata --maxWorkers=2`. Browser smoke command: `pnpm exec playwright test e2e/access-boundary/access-boundary.spec.ts e2e/drafts/edit-drafts.spec.ts e2e/public-metadata/public-metadata.spec.ts`. Run the complete `pnpm test:e2e` once for the selected framework change; these focused cases do not substitute for that gate.

- [ ] Obtain one independent code/security review of the actual dependency/patch diff and test matrix. Rerun only affected checks after corrections. No screenshots unless a demonstrated UI defect needs evidence.
- [ ] Only after positive proof, remove the expected-failure classification and update the authoritative Task 18/Phase 5 blocker records. Link evidence here; avoid duplicating contracts. If a retained framework patch creates a lasting maintenance decision, document it in an ADR with removal/version-update instructions.
- [ ] Open a focused PR to main with baseline failure, candidate version/patch provenance, passing proof and rollback. Do not merge, deploy or claim launch readiness without hosted checks and the remaining human/operational gates.

## Planning validation

Read the original investigation, current error boundaries, proxy matcher, production Playwright configuration, synthetic search fixture and installed 16.4.2 error-shell source. Checked official upstream issue/PR state and latest stable release notes. No runtime reproduction, candidate install, build, dependency patch, migration or browser suite was run in this planning session. The framework failure remains recorded as unresolved.

## Stable-upgrade experiment

User authorized testing the stable upgrade first. On branch `test/resource-404-stable-upgrade`, base `5b2d491` (documentation on main `a3146a1`), compared Next 16.4.2 and 16.4.6 under Node 22.20.0 / pnpm 11.25.0. React stayed 19.3.0; `eslint-config-next` matched each Next version. Both runs used production build/start through the existing Playwright web server and fixed local synthetic fixtures. No working database reset or migration occurred.

For the experiment only, removed the hardcoded `test.fail` marker from the existing no-JavaScript resource probe and asserted HTTP 404 before asserting visible recovery. This prevented an expected failure from masquerading as a fix. The checked-in test was restored afterward.

| Production candidate | Hydrated recovery, desktop/mobile | No-JavaScript recovery, desktop/mobile | Build  |
| -------------------- | --------------------------------- | -------------------------------------- | ------ |
| Next 16.4.2          | 2 passed                          | 2 failed: recovery searchbox absent    | Passed |
| Next 16.4.6          | 2 passed                          | 2 failed: recovery searchbox absent    | Passed |

Identical focused command for both candidates: `pnpm exec playwright test e2e/public-search/public-search.spec.ts --grep 'missing, private|resource 404'`. Both no-JavaScript probes returned HTTP 404 but had no visible main/searchbox. This is sufficient to reject 16.4.6 as the proposed fix; broader framework regression suites were not run.

The initial baseline command also selected `unmatched URLs`. Its initial recovery shell rendered, but native search returned **Search temporarily unavailable** and zero articles instead of twelve on both projects. The serial suite then skipped the resource probes. Reran the narrower command above to isolate the actual renderer defect. This separate local search failure was not fixed or attributed to the upgrade; no full search-suite pass is claimed.

Restored `package.json`, `pnpm-lock.yaml`, the original expected-failure test, and the installed 16.4.2 dependencies. Removed the experiment’s ignored production build artifact to avoid reusing a 16.4.6 build with restored dependencies. Only documentation of the experiment is retained. The stable-upgrade stage is complete with a negative result. The blocker remains; no backport, route workaround, PR, merge or deployment was attempted.
