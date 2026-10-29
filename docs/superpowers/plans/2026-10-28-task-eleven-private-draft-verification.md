# Task 11 Private Draft Workflow Verification Plan

> **For agentic workers:** Use superpowers:executing-plans with the preserved native method and verify-and-stop for evidence scope. Perform the proof sets below, request one fresh whole-slice review, fix demonstrated blocking defects only, and stop for owner handoff.

**Goal:** Prove Phase 3 private-draft upgrade preservation, clean installation, security boundaries and complete journeys, with evidence tied to the verified source and final hosted commit.

**Architecture:** Verify the existing application rather than add product behavior. Preserve the original populated local project and its private evidence; use a separate namespaced Supabase project for representative content upgrade and clean-reset proof. Existing hosted CI provides the fresh default-environment application check. Temporary helpers/results stay in this plan's ignored workspace.

**Tech Stack:** Existing Node 22, pnpm 11.25.0, locked Supabase CLI 2.121.0, Docker, Vitest/pgTAP/Playwright, existing GitHub Actions, and the workflow's pinned Gitleaks v8.30.1 image. No new application dependency or external service.

**Spec:** [Accepted Phase 3 contract](../specs/2026-10-22-private-draft-workflow-design.md); [parent Task 11](2026-10-22-phase-three-private-drafts.md#task-11-integrated-verification-and-handoff).

**Plan approval baseline:** Task 10 was complete locally at `04fc19d`, with no PR or hosted run. GitHub main was `3de2b3b` (Task 9/PR #24). This branch is `docs/private-draft-workflow-verification` in `/private/tmp/the-gavel-task11`, based on Task 10. The historical pre-Phase-3 schema is available at `bb86c0e`.

**Execution status:** Local gates, preservation and clean-install evidence, and fresh review are complete. The exact-head hosted workflow passed on verification commit `dfacc04` ([run 40794333210](https://github.com/dylandrozario/the-gavel/actions/runs/40794333210)). After Task 10 PR #25 merged to `main`, the owner requested a separate Task 11 PR against `main`; that PR will run the full workflow on its own head.

## Global constraints

- No reset/stop/recreation of the existing `the-gavel` Docker project or its volumes. Preserve prior worktrees, screenshots, original rows and all earlier private upgrade evidence.
- Only a separately created Task 11 project may be reset, after its upgrade proof is saved and checked. Verify its project ID, dedicated ports and container identity before every database mutation/reset/cleanup; refuse the original project or hosted targets.
- No new feature, migration, dependency, broad cleanup, public URL/auth/lifecycle change or invented client decision. A demonstrated Critical/Important defect may receive the smallest regression-tested fix; record its cause, scope and actual gates.
- Respect existing fixed-local-target guards. Do not make application/browser/concurrency helpers accept arbitrary database targets to accommodate this audit.
- Synthetic identities/content only; no real users, credentials, production data or elevated application client. Store raw fingerprints/dumps/logs privately, without echoing content or secrets. Secret-scan output must be redacted.
- Current dependency scans are unfiltered: the former advisory exception is retired. Do not follow obsolete parent-plan wording as permission to reintroduce an ignore.
- Serialize pgTAP and cross-session concurrency against the same database. Reuse current, source-matching Task 10 local results where justified; a clean database/source change requires its affected checks anew.
- Keep meaningful Conventional Commits around 300 changed text lines. Human review, hosted provider/session assurance, accessibility, recovery/retention and unresolved client decisions remain explicitly outstanding unless actually completed.

## Evidence found during planning

The original Phase 3 workspace at `/Users/dylandrozario/.codex/worktrees/project-foundation/the-gavel/.superpowers/sdd/2026-10-22-phase-three-private-drafts/` contains `baseline.sql`, pre-Task-2 and later fingerprint JSONs, task logs and the execution ledger. The baseline contains five synthetic auth.users and four profiles/memberships, but zero article/taxonomy/association/history rows. Original public/auth.identities hashes match through Task 8; auth.users changed after the documented foundation browser metadata setup. Preserve the pre-browser all-table match and later expected Auth exception separately.

Tasks 9/10 retained additional 14-table public/private/auth.identities fingerprints in their own ignored workspaces. They prove recent original-row preservation, not a populated-content upgrade. A separate representative content fixture below closes that gap; do not describe empty article hashes as article-data preservation proof.

## Review focus

1. Upgrade proof must exercise nonempty articles/links/history and preserve legacy/NULL content, not only empty content tables or recreated seed identities (sets 1–2).
2. Isolation guards must prevent any reset, cleanup, namespace/port collision or secret output affecting the original project/evidence (sets 1–3).
3. Owner/admin/non-owner/credited/ineligible/anonymous boundaries and failed/replayed/concurrent mutations must remain enforced through direct interfaces, not merely hidden UI (sets 2–4).
4. Canonical/native formats, bounds, snapshots, no-op/retry/version/quota semantics and editor recovery must match across upgrade, fresh installation and the actual final source (sets 2–4).
5. Hosted evidence must match the final pushed SHA; human/manual/hosted-provider work and source-changing fixes cannot be hidden behind earlier green runs (sets 4–5).

## Proof set 1: provenance and original populated-project preservation

**Artifacts:** Private `provenance.json`, copies/hashes of the specifically referenced baseline evidence, `original-before.json`, `original-after.json`, and gate manifests in this plan's ignored workspace. Preserve all source artifacts in place.

- [x] Record exact Task 10/source/base SHAs, clean worktree state, migration file hashes/order, Node/pnpm/CLI versions and existing local container/project identity. Verify historical migrations predating `20261022000000` match `bb86c0e`; never edit applied files.
- [x] Compare the original pre-Task-2 fingerprints with retained pre-browser Task 5 evidence, and compare original public/auth.identities hashes with current rows. Separate the known synthetic auth.users browser metadata changes; do not claim that table remained byte-identical after setup. Retain counts/hashes and migration-history evidence without printing raw user rows.
- [x] Compare current original-project public/private/auth.identities rows with the Task 9/10 snapshots, accounting only for their documented table-set/hash-format differences. Missing provenance or unexpected changes are findings to investigate before any reset elsewhere is called proof.
- [x] Run/reuse the full current SQL denial suite on the unchanged original project, then capture preservation again. Expected: all 1,075 assertions pass and original protected rows match. No reset is involved.

## Proof set 2: representative populated-content upgrade in a disposable project

**Artifacts:** Private staged Supabase workdir, `upgrade-fixture.sql`, explicit-column fingerprint SQL/JSON, before/after metadata, role-denial results and migration logs. New documentation may link the outcome, never raw private dumps.

- [x] Stage `bb86c0e` config/seed/migrations in this plan's workspace. Set unique project ID `the-gavel-task11-verification`; ports 55320–55329 were occupied, so the checked free range 56320–56329 was used instead. Unused services/edge inspector were disabled; db/auth/REST/gateway remained for bootstrap. The pinned CLI used `--workdir <staged-root>`.
- [x] Start only this isolated project and confirm Phase 2 migration history. Add collision-checked synthetic verification actors and a small representative content set: NULL-body draft, supported version-one body draft, legacy-object body, taxonomy/tag links, guest/multiple-role credits, existing revision snapshot and audit event. Use the historical schema/constraints and trusted identity fixtures; no real content or unresolved labels.
- [x] Save all preexisting fixture fields/links/history plus schema/grant evidence. Apply the seven existing Phase 3 migrations in order with `pnpm exec supabase migration up --local --workdir <staged-root>` after copying the unchanged files. No edits to production migrations.
- [x] Compare every original field/link/history value byte-for-byte in normalized snapshots; only new article `edit_version=1` is an expected additive field. Prove NULL and legacy JSON remain unchanged, existing snapshots are not rewritten, new receipt/quota tables begin empty and no revision/audit is fabricated by migration.
- [x] Execute focused transaction-rolled-back anonymous/ineligible/author A/author B/credited B/admin checks against this representative data: private reads and direct writes remain denied where required; credit confers no authority; allowed owner/admin operations use only existing RPCs and preserve rollback/version/history guarantees. Keep fixture changes out of the saved original-row comparison. Export proof before reset; expected mismatches/denials produce nonzero checks rather than silent summaries.

## Proof set 3: clean installation without touching the original project

**Artifacts:** Isolated project reset/install logs, empty-content assertions, SQL/lint/type outputs and pre/post original-project fingerprints.

- [x] Only after set 2 proof is checked and retained, re-verify the isolated ID/ports/container and reset that project with the full current migration chain and committed synthetic seed. Never run default-workdir `db reset` in this task.
- [x] Assert clean content/association/history/receipt/quota tables are empty and the expected foundation identities/memberships come only from the committed seed. No representative upgrade fixtures may leak into clean-install proof.
- [x] Copy current `supabase/tests/` including `support/` into the isolated workdir, then run the existing 25 pgTAP SQL files and database lint through that CLI workdir. All 1,075 assertions passed and schema lint found no errors. Generated types used the same flags/Prettier configuration as `scripts/database-types/database-types.mjs` and match committed types.
- [x] Application parity/editor/concurrency/browser helpers keep their original fixed-project checks. Run them against the preserved original local project in set 4; exact-head hosted CI separately exercises the full application suite on a fresh default project.
- [x] Recheck the original project fingerprints after isolated upgrade/reset. Original rows remained unchanged; the isolated project alone was stopped after evidence was saved. The original project and prior evidence remain intact.

## Proof set 4: integrated source/security/interaction gates

**Files:** Existing tests/types/docs only unless a reproduced defect requires a focused fix. Private logs may be reused only when their source, dependency, schema and configuration match the verified state.

- [x] Install with Node 22/pnpm 11.25.0 and frozen lockfile. Focused RED→GREEN runs preceded the fix; `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (463), `pnpm test:db` (1,075), `pnpm db:types:check`, isolated `supabase db lint`, `pnpm test:draft-contract` (216), `pnpm test:draft-editor` (8), `pnpm test:draft-concurrency` (25) and full `playwright test` (78, configured production build/start) passed. SQL and concurrency suites were serialized.
- [x] Unfiltered production and full dependency audits reported no known vulnerabilities. The history secret scan passed in the [exact-head hosted run](https://github.com/dylandrozario/the-gavel/actions/runs/40794333210); the Task 11 PR reruns the full gate.
- [x] Current desktop/mobile selector screenshots were refreshed by Playwright and visually inspected. Automated keyboard/focus/navigation tests passed. Screen-reader/manual certification, real Google session issuance/refresh, hosted security headers/provider setup and backup restoration remain unclaimed.
- [x] Fresh whole-slice read-only security/code review covered `bb86c0e..04fc19d`, the accepted spec and five parent review-focus paths, including all seven Phase 3 migrations and their grants/authorization/format/history compatibility. It found one Important category read redirect issue; observed RED→GREEN tests and relevant full gates pass after the narrow fix. No Critical finding was reported.
- [x] Final original-row comparisons match after all fixture suites. Isolated upgrade/fresh-install evidence and prior source evidence are preserved privately for handoff.

## Proof set 5: final documentation and exact-head hosted CI

**Files:** Update README, `docs/testing.md`, affected API/data/security/component/ADR notes and parent plan; create a concise `docs/reviews/phase-3-private-drafts.md` review/evidence map. Do not duplicate the authoritative payload/schema contract.

- [x] Document actual installed editor packages, implemented read/write boundaries, unsupported-content preservation, exact retry/quota/no-op/version/history semantics, navigation limitations, rollback approach and unresolved media/public/lifecycle/client/human/provider decisions. Clearly separate original identity upgrade preservation from the additional populated-content reproduction.
- [x] Commit all final tracked artifacts in focused commits. This branch was based on Task 10 at `04fc19d`; Task 10 later merged to `main` as PR #25. The GitHub comparison against current `main` contains only Task 11 changes.
- [x] Publish this verification branch to the existing GitHub repository and trigger the existing `ci.yml` via `gh workflow run --ref docs/private-draft-workflow-verification`. This push/dispatch is part of the approved verification scope; no production deployment or merge is included. The workflow already supports dispatch, requires no production secrets and runs frozen install, full local/fresh DB/app/browser gates, history secret scan and unfiltered audits.
- [x] Observe the completed run and assert its head SHA equals verification commit `dfacc04` and conclusion is success. Keep the run URL/SHA/result in this plan and the completion response. A subsequent tracked change requires the new head's hosted gate to run again.
- [x] Stop at owner handoff with concrete pass/fail/unavailable results and links. Automated Phase 3 verification can be called complete only after required local and exact-head hosted gates pass; independent human/manual/provider work remains separately outstanding. Do not begin another product slice.

**Owner follow-up (2026-10-29):** After PR #25 merged, the owner requested a separate pull request for this completed Task 11 branch against `main`. PR creation does not expand product scope or authorize merging or deployment; the pull-request workflow reruns the full gates on its head.

## Acceptance and stop condition

Complete when the original project is preserved, representative populated-content upgrade and isolated clean installation are proven, required current-source local/hosted/security gates pass, whole-slice review findings are resolved or honestly classified, and documentation reports the implemented capability and remaining launch work. An unavailable required gate remains unavailable rather than silently waived. If environment limits prevent a second isolated stack, use an equivalent disposable CI/local environment and document the substitution before claiming proof; never reset the original project as a shortcut.

Any verification fix rolls back by reverting its narrow application consumer; retain applied migrations and stored data. The disposable project's lifecycle is separately guarded. No destructive migration, production service change or expansion beyond private drafts is authorized by this plan.
