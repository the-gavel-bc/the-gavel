# Task 11 Private Draft Workflow Verification Plan

> **For agentic workers:** Use superpowers:executing-plans with the preserved native method and verify-and-stop for evidence scope. Perform the proof sets below, request one fresh whole-slice review, fix demonstrated blocking defects only, and stop for owner handoff.

**Goal:** Prove Phase 3 private-draft upgrade preservation, clean installation, security boundaries and complete journeys, with evidence tied to the verified source and final hosted commit.

**Architecture:** Verify the existing application rather than add product behavior. Preserve the original populated local project and its private evidence; use a separate namespaced Supabase project for representative content upgrade and clean-reset proof. Existing hosted CI provides the fresh default-environment application check. Temporary helpers/results stay in this plan's ignored workspace.

**Tech Stack:** Existing Node 22, pnpm 11.25.0, locked Supabase CLI 2.121.0, Docker, Vitest/pgTAP/Playwright, existing GitHub Actions, and the workflow's pinned Gitleaks v8.30.1 image. No new application dependency or external service.

**Spec:** [Accepted Phase 3 contract](../specs/2026-10-22-private-draft-workflow-design.md); [parent Task 11](2026-10-22-phase-three-private-drafts.md#task-11-integrated-verification-and-handoff).

**Baseline/status:** Planning only. Task 10 is complete locally at `04fc19d`, with no PR or hosted run yet. GitHub main remains `3de2b3b` (Task 9/PR #24). This branch is `docs/private-draft-workflow-verification` in `/private/tmp/the-gavel-task11`, based on Task 10. The historical pre-Phase-3 schema is available at `bb86c0e`. No Task 11 database mutation, reset, service startup, dependency installation, push or CI dispatch has run.

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

- [ ] Record exact Task 10/source/base SHAs, clean worktree state, migration file hashes/order, Node/pnpm/CLI versions and existing local container/project identity. Verify historical migrations predating `20261022000000` match `bb86c0e`; never edit applied files.
- [ ] Compare the original pre-Task-2 fingerprints with retained pre-browser Task 5 evidence, and compare original public/auth.identities hashes with current rows. Separate the known synthetic auth.users browser metadata changes; do not claim that table remained byte-identical after setup. Retain counts/hashes and migration-history evidence without printing raw user rows.
- [ ] Compare current original-project public/private/auth.identities rows with the Task 9/10 snapshots, accounting only for their documented table-set/hash-format differences. Missing provenance or unexpected changes are findings to investigate before any reset elsewhere is called proof.
- [ ] Run/reuse the full current SQL denial suite on the unchanged original project, then capture preservation again. Expected: all 1,075 assertions pass and original protected rows match. No reset is involved.

## Proof set 2: representative populated-content upgrade in a disposable project

**Artifacts:** Private staged Supabase workdir, `upgrade-fixture.sql`, explicit-column fingerprint SQL/JSON, before/after metadata, role-denial results and migration logs. New documentation may link the outcome, never raw private dumps.

- [ ] Stage `bb86c0e` config/seed/migrations in this plan's workspace. Set unique project ID `the-gavel-task11-verification`; assign ports 55320–55329 instead of 54320–54329 and disable unused services/edge inspector to avoid collisions. Check actual availability first. Use pinned CLI `--workdir <staged-root>`; keep db/auth/REST/gateway as required for valid bootstrap. Exclude unused services only through the CLI's documented names.
- [ ] Start only this isolated project and confirm Phase 2 migration history. Add collision-checked synthetic verification actors and a small representative content set: NULL-body draft, supported version-one body draft, legacy-object body, taxonomy/tag links, guest/multiple-role credits, existing revision snapshot and audit event. Use the historical schema/constraints and trusted identity fixtures; no real content or unresolved labels.
- [ ] Save all preexisting fixture fields/links/history plus schema/grant evidence. Apply the seven existing Phase 3 migrations in order with `pnpm exec supabase migration up --local --workdir <staged-root>` after copying the unchanged files. No edits to production migrations.
- [ ] Compare every original field/link/history value byte-for-byte in normalized snapshots; only new article `edit_version=1` is an expected additive field. Prove NULL and legacy JSON remain unchanged, existing snapshots are not rewritten, new receipt/quota tables begin empty and no revision/audit is fabricated by migration.
- [ ] Execute focused transaction-rolled-back anonymous/ineligible/author A/author B/credited B/admin checks against this representative data: private reads and direct writes remain denied where required; credit confers no authority; allowed owner/admin operations use only existing RPCs and preserve rollback/version/history guarantees. Keep fixture changes out of the saved original-row comparison. Export proof before reset; expected mismatches/denials produce nonzero checks rather than silent summaries.

## Proof set 3: clean installation without touching the original project

**Artifacts:** Isolated project reset/install logs, empty-content assertions, SQL/lint/type outputs and pre/post original-project fingerprints.

- [ ] Only after set 2 proof is checked and retained, re-verify the isolated ID/ports/container and reset that project with the full current migration chain and committed synthetic seed. Never run default-workdir `db reset` in this task.
- [ ] Assert clean content/association/history/receipt/quota tables are empty and the expected foundation identities/memberships come only from the committed seed. No representative upgrade fixtures may leak into clean-install proof.
- [ ] Copy current `supabase/tests/` including `support/` into the isolated workdir, then run the existing 25 pgTAP SQL files and database lint through that CLI workdir. Expected: all 1,075 assertions and schema lint pass. Generate local types there with the same flags/Prettier configuration as `scripts/database-types/database-types.mjs` and compare to committed types without overwriting them.
- [ ] Application parity/editor/concurrency/browser helpers keep their original fixed-project checks. Run them against the preserved original local project in set 4; exact-head hosted CI separately exercises the full application suite on a fresh default project.
- [ ] Recheck the original project fingerprints after isolated upgrade/reset. Expected: original rows unchanged. Stop/remove only the isolated project's containers/volumes after all useful evidence is saved; preserve the original project and prior evidence.

## Proof set 4: integrated source/security/interaction gates

**Files:** Existing tests/types/docs only unless a reproduced defect requires a focused fix. Private logs may be reused only when their source, dependency, schema and configuration match the verified state.

- [ ] Install with Node 22/pnpm 11.25.0 and frozen lockfile. Run focused failures first, then `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:types:check`, `pnpm supabase db lint`, `pnpm test:draft-contract`, `pnpm test:draft-editor`, `pnpm test:draft-concurrency`, and `pnpm exec playwright test` (configured production build/start). Expected baseline: 461 unit/component, 1,075 SQL, 216 canonical parity, eight real-engine parity, 25 concurrency and 74 desktop/mobile cases; record actual counts and source-matching reuse explicitly. SQL/concurrency remain serialized.
- [ ] Run unfiltered `pnpm audit --prod --audit-level=high` and `pnpm audit --audit-level=high`. Run pinned Gitleaks v8.30.1 with `--redact --no-banner` on a private full local clone of the verification branch so Docker can read complete Git history without unresolved worktree pointers. Use read-only mounts; do not scan only the current directory and call it history coverage.
- [ ] Visually inspect current desktop/mobile create/edit/selection/recovery artifacts and verify actual keyboard/focus/navigation checks. Do not claim screen-reader/manual certification, real Google session issuance/refresh, hosted security headers/provider setup or backup restoration without executing those checks.
- [ ] Request one fresh whole-slice read-only security/code review covering `bb86c0e..verification HEAD`, the accepted spec and five parent review-focus paths, including all seven Phase 3 migrations and their grants/authorization/format/history compatibility. Fix Critical/Important findings through observed RED→GREEN regression tests and relevant full gates. Record minor findings/limitations; do not add polish after proof passes.
- [ ] Save final original-row comparisons after every fixture suite has cleaned up. Preserve the isolated upgrade/fresh-install evidence and prior source evidence for owner handoff.

## Proof set 5: final documentation and exact-head hosted CI

**Files:** Update README, `docs/testing.md`, affected API/data/security/component/ADR notes and parent plan; create a concise `docs/reviews/phase-3-private-drafts.md` review/evidence map. Do not duplicate the authoritative payload/schema contract.

- [ ] Document actual installed editor packages, implemented read/write boundaries, unsupported-content preservation, exact retry/quota/no-op/version/history semantics, navigation limitations, rollback approach and unresolved media/public/lifecycle/client/human/provider decisions. Clearly separate original identity upgrade preservation from the additional populated-content reproduction.
- [ ] Commit all final tracked artifacts in focused commits. This branch contains the unmerged Task 10 implementation as its base; do not pretend Task 10 is already on main or silently rebase it away.
- [ ] Publish this verification branch to the existing GitHub repository and trigger the existing `ci.yml` via `gh workflow run --ref docs/private-draft-workflow-verification`. This push/dispatch is part of the approved verification scope; no production deployment, PR creation or merge is included. The workflow already supports dispatch, requires no production secrets and runs frozen install, full local/fresh DB/app/browser gates, history secret scan and unfiltered audits.
- [ ] Observe the completed run and assert its head SHA equals the final pushed/locally verified commit and conclusion is success. Keep the run URL/SHA/result in private evidence and the completion response; avoid a self-referential documentation commit after that check. A subsequent tracked change requires the new final SHA's hosted gate to run again.
- [ ] Stop at owner handoff with concrete pass/fail/unavailable results and links. Automated Phase 3 verification can be called complete only after required local and exact-head hosted gates pass; independent human/manual/provider work remains separately outstanding. Do not begin another product slice.

## Acceptance and stop condition

Complete when the original project is preserved, representative populated-content upgrade and isolated clean installation are proven, required current-source local/hosted/security gates pass, whole-slice review findings are resolved or honestly classified, and documentation reports the implemented capability and remaining launch work. An unavailable required gate remains unavailable rather than silently waived. If environment limits prevent a second isolated stack, use an equivalent disposable CI/local environment and document the substitution before claiming proof; never reset the original project as a shortcut.

Any verification fix rolls back by reverting its narrow application consumer; retain applied migrations and stored data. The disposable project's lifecycle is separately guarded. No destructive migration, production service change or expansion beyond private drafts is authorized by this plan.
