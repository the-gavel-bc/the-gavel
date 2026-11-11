# Second review-fix batch implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` when implementation is authorized. Follow the four ordered tasks below; write regression coverage alongside each change and execute testing after the batch, matching the user's testing preference.

**Goal:** Address the next relatively small review issues and remove one deterministic CI inefficiency.

**Architecture:** Keep changes within the current recovery UI, browser-safe reader links and CI configuration. Preserve mutation authority, exact command receipts and fresh database reads. Do not add dependencies, services, caches, migrations or new public routes.

**Tech stack:** Existing Next.js/React/TypeScript, Vitest, Playwright, pnpm and GitHub Actions stack, using documented Node 22 tooling.

**Spec:** [Cross-PR review](../../reviews/phase-1-5-pr-review.md). This plan follows the [first batch](2026-11-10-review-fixes-easy-first.md), implemented in [PR #77](https://github.com/dylandrozario/the-gavel/pull/77).

## Scope, baseline and approach

At planning time, PR #77 is open at `ef21147`; main is `895bd98`, including merged PRs #70–#76. First-batch fixes are implemented on #77 but must not be described as merged. Recheck those states before implementation. Prefer a new isolated branch from main after #77 merges. If work must begin earlier, explicitly record a stack on #77 and its temporary PR base rather than duplicating its commits against main.

Selected order is finding **13**, finding **18**, finding **20**, then optimization **O5**. Relative effort is small, small-to-medium, small-to-medium and small-to-medium respectively. This is implementation complexity order, not severity order; no duration is promised.

Media findings 7 and 26 were considered for this batch, but they share unresolved-write, version and form-locking concerns. A retry button alone does not protect newer edits or preserve the original version. They are deferred together rather than presented as isolated one-line fixes. Mailto finding 19 also needs behavior verification before being treated as a bug.

The proposed choices below belong to the planner until implementation is authorized. This session changes planning documentation only; it does not implement, commit, push, merge or modify PR #77.

## Global constraints and review focus

- Read README, coding style, testing and development workflow before editing. Read API/component/design/security docs for the task's boundary; preserve authored rules and unrelated working-tree changes.
- Keep one focused commit per task, aiming for at most 300 changed lines. Review completed slices before a PR. If wider changes are needed, split them rather than broadening a small task silently.
- Write tests alongside fixes; run them after all authorized batch changes, as the user requested previously. No pre-change test pass or red/green sequence may be claimed without having run it.
- Do not change public URL existence, redirects, canonical metadata, authorization or content lifecycle. Task 2 only updates links to the already approved canonical `/letters` route. Discuss first if implementation would change that contract.
- Preserve dirty-input warnings, exact pending commands, expected versions, role/ownership denials and local recovery snapshots. A read cannot prove an uncertain write committed or authorize a force overwrite.
- Keep CI checks, scanner version, read-only permissions and cleanup-on-failure behavior. Do not solve build duplication through unverified cross-environment artifact reuse.
- No screenshots by default. No existing local database reset. Browser tests may use only the documented fixed synthetic fixtures.

Review focus: status changes must not silently discard local edits; letters categories must retain their category paths; pending writes must block unsafe recovery; pinned CI references must actually resolve; and the sole browser-test build must use the same public environment as the server it starts.

## Task 1 — stop incompatible conflict reloads (finding 13)

**Branch intent:** `fix/conflict-recovery-status`.

**Files:** `src/frontend/features/articles/components/draft-form/draft-form.tsx`, its adjacent test, `components/draft-conflict-panel/draft-conflict-recovery.test.tsx` as needed, and `e2e/drafts/draft-conflict-recovery.spec.ts`. Inspect the status-keyed owner article page and `use-draft-command.ts`; avoid changing their save-action contracts.

**Chosen approach:** keep the mounted form's status immutable. When reviewed detail has a different status, refuse to adopt its fields/version into the old save mode. Retain local input and show a specific status-change explanation with an explicit Reload article action. Block further saves through the stale mounted mode until reload. A same-status review keeps the current deliberate-load behavior.

- [ ] Add a regression where a draft is published in another tab, the old tab receives a conflict, and recovery reads published detail. Assert that local title/body remain intact, old draft saves stay blocked and the status-change message appears.
- [ ] In `onLoad`, check `detail.status` against the mounted `status` before calling `command.reload`. On mismatch, retain input, enter blocked recovery and expose the explicit reload action. Do not perform an automatic router refresh that erases the local reference.
- [ ] Use full-document reload only after the user chooses it; retain the existing beforeunload dirty-input guard so canceling preserves the tab. Keep unresolved pending commands ineligible for recovery. Do not change publication state or introduce draft restoration.
- [ ] Add same-status load, canceled reload, forbidden/noneditable review and unresolved-write cases. After deliberate reload, the published editor must call the existing published-save action, never the old draft action.

**Acceptance:** no repeated stale-mode save loop; no implicit loss of local edits or changed mutation authority. Test `draft-form`, `draft-conflict-panel` and the focused conflict-recovery browser spec in the final gate.

## Task 2 — canonical letters links (finding 18)

**Branch intent:** `fix/canonical-letters-links`.

**Files:** create `src/shared/reader/section-link/section-link.ts` and its adjacent test. Update `src/backend/public-articles/public-archive/public-archive.ts`, `src/frontend/components/site/reader-navigation/reader-navigation.tsx`, `site-footer/site-footer.tsx`, and the reader article-card, home-hero, home-section, article-header, archive-header and category-chips components that construct section links. Use search to confirm exact current filenames before editing.

**Interfaces:** a browser-safe `isLettersSection(section: {name: string}): boolean` preserves the existing exact case-insensitive label rule; `sectionHref(section: {name: string; slug: string}): string` returns `/letters` for that label, otherwise an encoded `/sections/<slug>` path. Keep the backend's existing predicate export compatible by re-exporting the shared predicate where existing consumers require it. Do not import backend runtime code into frontend/shared modules.

- [ ] Add table-driven helper tests for the approved letters label, case variants, ordinary sections and a merely similar label that must not match. Include encoded ordinary slugs as defensive input coverage.
- [ ] Move the existing predicate to the shared module without broadening its match rules. Replace only links representing section roots with `sectionHref`.
- [ ] Preserve section-scoped category URLs, including categories under the letters section. Do not append `/categories/...` to `/letters`; keep the current category route constructor for category links.
- [ ] Update component expectations for letters root links and retain ordinary-section/category expectations. Verify the existing `/sections/<letters-slug>` route remains reachable and still canonicalizes as before; no redirect or public route removal is part of this task.
- [ ] Add one public browser assertion that navigation/card letters links target `/letters`, while an ordinary category retains its existing path.

**Acceptance:** emitted section-root links use the approved canonical identity consistently; body links, category scopes, pagination cursors and public data permissions remain unchanged. Count call sites before/after rather than claiming one helper call proves all components were updated.

## Task 3 — immutable CI executable references (finding 20)

**Branch intent:** `ci/pin-executable-references`.

**Files:** `.github/workflows/ci.yml`; update `docs/git-github.md` with the durable pin-update rule if it is not already documented. Do not add an update bot or external service in this slice.

- [ ] At execution time, resolve each currently used checkout/setup-node/cache tag against its official upstream repository. Peel annotated tags to the commit. Record the resolved versions/commits in the task evidence before editing.
- [ ] Replace each action tag with its verified full commit SHA and retain the readable original version in a comment. Preserve inputs and the action version rather than combining pinning with upgrades.
- [ ] Resolve the current `ghcr.io/gitleaks/gitleaks:v8.30.1` manifest through the official registry and pin its verified digest. Preserve a manifest/index appropriate for the existing runner architecture and keep a version comment. Never invent a hash from memory or use a third-party hash list.
- [ ] Check YAML and workflow changes, existing read-only permissions, `persist-credentials: false`, cache inputs, scanner invocation and `always()` service cleanup. Record exact references so another reviewer can verify them independently.
- [ ] After the batch, inspect the hosted workflow run when available: actions must download, dependency/cache setup must work, and the pinned scanner must execute. Local source inspection alone does not establish a hosted pass.

**Acceptance:** executable CI dependencies are immutable without changing intended versions or privileges. If a reference cannot be resolved/verified, leave that item unimplemented and record the specific limit rather than substituting an untrusted value.

## Task 4 — remove the duplicate CI production build (O5)

**Branch intent:** `ci/build-once-for-browser-tests`.

**Files:** `.github/workflows/ci.yml`; inspect `playwright.config.ts` and `e2e/support/local-supabase/local-supabase.ts`. Update the testing document's build-gate description if required. Keep local `pnpm build` and the Playwright build/start command intact.

**Chosen approach:** let the existing Playwright web server perform the single production build using its verified local Supabase/public environment. Remove the earlier standalone CI `pnpm build` invocation. Rename the browser step to make its production-build responsibility explicit. Do not introduce a prebuilt-artifact mode or cache.

- [ ] Confirm the current path still contains exactly two builds: standalone CI build plus Playwright's `pnpm build && pnpm start --port 3100`. If it has already been consolidated upstream, record no change.
- [ ] Remove only the standalone invocation; retain browser runtime installation, full `pnpm test:e2e`, strict types, dependency/security scans, database checks and failure cleanup.
- [ ] Ensure a production build failure still fails the workflow, and browser startup cannot reuse a development or stale existing server (`reuseExistingServer` stays false).
- [ ] In the final gate, run the normal Playwright command from a clean build state and inspect logs: one production build, matching public environment, production server startup and the required desktop/mobile cases.
- [ ] Record total hosted duration before/after only if comparable successful runs are available. Otherwise claim removal of one build invocation, not a measured speedup.

**Acceptance:** one successful production build remains mandatory inside browser verification; no environment mismatch or reduced test coverage. Tasks 3 and 4 touch the same workflow and should run sequentially in separate commits.

## Final validation after the batch

Run only after all four authorized tasks are implemented, then rerun affected checks after any correction:

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, targeted Markdown formatting and `git diff --check`.
- [ ] Complete unit/component suite: `pnpm exec vitest run --maxWorkers=2 --testTimeout=20000`, recording the explicit timeout rather than changing the repository default.
- [ ] Focused checks for recovery, the new shared link helper, affected reader components and import boundaries. New tests must cover retained role/ownership and pending-write behavior; do not weaken assertions to make the change pass.
- [ ] Full `pnpm test:e2e` once before the PR because Task 4 changes the full browser/build gate. Use the documented local synthetic project without reset; capture counts, skips/failures and production-build evidence. If full infrastructure is unavailable, report the gap rather than treating focused browser tests as equivalent proof.
- [ ] Validate official action/image resolutions and the hosted CI result separately. No SQL or concurrency suite is required merely for these UI/helper/workflow changes unless implementation crosses those boundaries.
- [ ] Obtain one independent final diff review; correct blocking findings and rerun their affected checks. Update the original review findings with exact implementation commits/PRs only after verification.

## Work deliberately outside this batch

- **Production-priority work remains urgent:** administrator eligibility consistency (24) and cleanup fairness (28) now affect merged code; they still require separate, carefully scoped fixes and appropriate SQL/lease/concurrency proof. Easy-first order is not permission to launch with them unresolved.
- **Media state work:** findings 7 and 26 should share one design that preserves original request ID, expected version and payload, allows exact retry, and prevents image acknowledgements from marking newer form input clean. Then handle stuck uploads (5), uncertainty/conflict recovery (6) and lock order (25) in independently reviewed slices. Do not add just a button and call these complete.
- **Mailto (19):** verify a concrete client interoperability failure before changing the helper. Percent-encoding `@` alone is not sufficient bug evidence.
- **Upload/orphan/resource controls (10/11), browser CSP/deployment controls and no-JavaScript matched-resource 404:** keep existing launch gates visible; they are not quick UI edits.
- **O2/O3/O4:** editor traversal, narrow footer projection and pagination indexes need profiling/query plans before implementation. No measured benefit is assumed here.
- Findings already addressed by merged #71/#73/#76 or implemented in #77 must not be rebuilt. Reconcile exact current status from Git/PR heads when the next implementation begins.

## Planning evidence and handoff

Read current recovery/media handlers, section-link constructors, workflow and Playwright environment setup; checked current GitHub PR inventory and fetched main. Source review is planning evidence, not runtime proof of these future fixes. The first-batch test results are not reused as validation of this unimplemented batch.

The plan remains local documentation outside PR #77; that PR was not modified or republished. Implementation requires a subsequent user request. Record changed assumptions and actual validation here when work starts.

## Execution record

- User authorized all four tasks and requested only necessary local tests after implementation, with full validation left to CI. This supersedes the plan's full local unit/browser gates; no pre-implementation tests were run.
- Reused managed worktree `/Users/dylandrozario/.codex/worktrees/cc50/the-gavel` on `fix/review-second-batch`, originally based on `ef21147`. After PR #77 merged, fast-forwarded to its merge commit `6789a35` and reapplied this batch without conflicts. The resulting diff is based on current `main`, not a local stack.
- Recovery retains its existing save action and payload/version on status mismatch. A specific status message and deliberate full reload replace repeated stale-mode recovery; the existing unload guard protects local edits.
- Verified official tag resolutions with `git ls-remote https://github.com/actions/{checkout,setup-node,cache}.git refs/tags/v6 'refs/tags/v6^{}'`. Checkout: `d23441a48e516b6c34aea4fa41551a30e30af803`; setup-node: `249970729cb0ef3589644e2896645e5dc5ba9c38`; cache: `55cc8345863c7cc4c66a329aec7e433d2d1c52a9`. No peeled annotated-tag alternative was returned.
- Verified `ghcr.io/gitleaks/gitleaks:v8.30.1` using `docker buildx imagetools inspect`: OCI index `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`, including linux/amd64 manifest `sha256:b109bc5f8f76a38196a3e413704fc5b9e3c32360bce4e4b603bd6f45b3721dbb`. The index is pinned without changing scanner version.
- Local validation completed as recorded below. Hosted execution, full unit/browser/SQL/concurrency suites and performance timing are not claimed.

- Final-check corrections: removed the Playwright-only `exact` option from a Testing Library role query. Independent review identified that the new publication/recovery browser case needed finalized main-image metadata; added a recovery-only synthetic fixture using the established lifecycle-fixture pattern and included it in existing media cleanup. A targeted run of that one browser scenario will validate the correction; full browser verification remains with CI.

### Completion and focused verification

All four authorized tasks are implemented locally on `fix/review-second-batch`, stacked on PR #77 head `ef21147`. The original checklist remains the planning snapshot; the user's narrower end-only verification request supersedes its full-suite instructions. Branch publication and PR creation are tracked in the current STATUS.md; no merge occurred in this session.

| Task           | Result                                                                                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 / finding 13 | Status-mismatched recovery keeps local fields/version, blocks stale-mode saves and offers deliberate reload. The existing unload guard remains active; same-status adoption and unresolved-write exclusion are retained.                                              |
| 2 / finding 18 | Eight frontend components use the browser-safe section-root helper. Backend archive resolution shares its existing case-insensitive label predicate, preserving the compatible predicate export. Letters roots use `/letters`; category routes remain section-scoped. |
| 3 / finding 20 | Checkout/setup-node/cache use the officially resolved full SHAs; gitleaks uses the verified v8.30.1 multi-platform OCI index digest. Versions, permissions, inputs and scanner arguments remain otherwise unchanged.                                                  |
| 4 / O5         | Removed the standalone CI build; the explicitly named production-build/browser step still uses Playwright's `pnpm build && pnpm start` with `reuseExistingServer: false`. One build invocation is removed; no timing speedup is claimed.                              |

Checks ran only after implementation, under Node 22.20.0 / pnpm 11.25.0:

- Focused Vitest command: `pnpm exec vitest run src/frontend/features/articles/components/draft-form/draft-form.test.tsx src/frontend/features/articles/components/draft-conflict-panel src/shared/reader/section-link src/frontend/features/reader/components/article-card src/frontend/features/reader/components/archive-grid src/frontend/components/site src/backend/public-articles/public-archive scripts/import-boundaries/import-boundaries.test.mjs --maxWorkers=2 --testTimeout=20000` — **13 files / 70 tests passed**. Covers retained input/unload warnings, pending-write exclusion, same-status recovery, canonical links across affected components, category scope, archive identity and import boundaries.
- After correcting the test-only role-query option, its component suite was rerun: **9 tests passed**. This overlaps the 70 tests and is not an additional unique-test count.
- `pnpm typecheck` — passed after correcting the Testing Library option. Targeted ESLint and Prettier checks for changed source/tests passed; existing unrelated Markdown table formatting was left untouched.
- Parsed the workflow with the already installed YAML library and compared it with `ef21147`: triggers, permissions, concurrency, job environment/time limit, all non-build steps and always-run cleanup are preserved after normalizing only the verified pins and the renamed browser step. The standalone build is the sole removed step; Playwright still builds/starts and refuses server reuse. No validator dependency was added.
- `pnpm exec playwright test e2e/drafts/draft-conflict-recovery.spec.ts --grep 'status-changing recovery'` — **2 desktop/mobile cases passed**. The command performed the required production build/start; the cases cover published-elsewhere recovery, retained title/body, blocked stale saves, canceled reload, deliberate reload, and successful published-mode save. Synthetic finalized-image metadata was seeded and cleaned up through the existing local fixture pattern; no reset or migration occurred.
- `git diff --check` and targeted formatting checks passed. No screenshots were generated by the selected browser scenario.

Independent final review found one important test-fixture omission (publication readiness required an image); it was corrected and the affected browser scenario passed. No other blocking finding was reported. Full local unit/browser/SQL/concurrency suites, dependency scans and hosted action/image execution were deliberately left to CI at the user's request. These local checks are not a claim that CI has run or passed.

### PR preparation update — 2026-11-11

PR #77 merged into main at `6789a35`. This batch was reapplied to that merge, preserving the original implementation and verification evidence. The commit and PR are being prepared from the updated base.

### PR 80 integration after PR 78

Merged main at `fc43967` into this branch without rewriting history. PR 79 remains separate and unmerged. The form retains status-mismatch recovery alongside main's image busy guards and version-only acknowledgements. Resolved the shared test insertion by retaining both recovery and media acknowledgement regressions; retained both review follow-up sections and updated STATUS.md.

Validation: 62 focused tests across nine form, conflict, media and save-state files passed. TypeScript, targeted ESLint and full formatting checks passed. Both desktop/mobile status-changing recovery browser cases passed, including a production build/start. Hosted CI remains required.

## Integration with merged PR 79

Merge main `ede546d` without rewriting shared history. Keep both footer helpers (canonical section paths and contact links), both recovery and unused-upload form tests, and both review-evidence sections. Preserve main's precise E2E action capture. Acceptance: no unresolved conflicts, no dropped regression tests, status-changing recovery retains local input, cleanup guards remain enforced, canonical links stay intact and the pinned single-build CI workflow is retained. Run focused form/reader tests, types, lint, formatting and desktop/mobile recovery browser cases before publishing.

Integration verification passed: 58 focused unit/component cases; 24 desktop/mobile browser cases across draft conflict recovery, save recovery and public archives, including the production build; `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, targeted plan formatting and diff checks. Independent review found no actionable issues. Generated browser screenshots were restored. Full hosted CI remains the merge gate; no PR was merged or deployed.
