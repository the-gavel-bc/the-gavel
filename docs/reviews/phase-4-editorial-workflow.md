# Phase 4 integrated verification and handoff

Status: local integrated verification and agent review completed on `docs/phase-four-verification`, starting from merged main `cd67443`. Owner-run hosted CI and human maintainer approval remain pending. Tasks 1–15 and the source-ownership refactor are present. This document combines the Task 16 proof plan and evidence; it does not claim Phase 5 or hosted launch is complete.

## Acceptance and proof plan

- Prove a populated upgrade from Phase 3 `1285933` to this source and a clean install in a disposable project. Preserve the existing local project and its data. Compare every original column in baseline tables, including identity, article status/content/slug, associations, revisions, audit and receipts. Record intended additive backfills separately.
- Run configured format/lint/type/unit, database/contract/editor/concurrency, generated-type/schema, production build/browser, dependency and history-secret gates. Keep stateful database suites sequential. Run browser journeys against the existing fixed local synthetic fixture project; never reset it.
- Obtain a fresh whole-phase agent security/code review. Resolve demonstrated blocking defects with focused failing/passing checks; keep human maintainer approval separate.
- Use browser keyboard/forms/upload checks as automated accessibility evidence; leave screen-reader and real hosted OAuth/provider/cron/recovery checks explicit.
- Honor the owner's instruction to leave hosted CI monitoring to them. The final PR must link the required check without claiming an unseen exact-head pass. No new feature or screenshot collection is part of this task.

## Verification ledger

[Draft PR #48](https://github.com/dylandrozario/the-gavel/pull/48) carries this handoff. The owner verifies its final commit in [PR checks](https://github.com/dylandrozario/the-gavel/pull/48/checks); no hosted pass is claimed.

The verified application-code commit is `2a6ce63` (later handoff commits change documentation only). Node 22.20.0, pnpm 11.25.0, and pinned Supabase CLI 2.121.0 were used. Existing local Supabase data was not reset or stopped.

| Gate                           | Observed result                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locked install                 | `pnpm install --frozen-lockfile` passed; initial offline attempt lacked a cached package                                                                                        |
| Formatting, lint, strict types | `pnpm format:check`, `pnpm lint`, `pnpm typecheck` passed after the fixes                                                                                                       |
| Unit/component                 | `pnpm test --maxWorkers=2`: 641 passed in 94 files                                                                                                                              |
| Existing-project SQL           | `pnpm test:db`: 1,590 assertions passed in 48 files                                                                                                                             |
| Clean-install SQL              | CLI reset/test on the disposable project: the same 1,590 assertions passed                                                                                                      |
| Schema lint                    | No errors on existing and disposable clean schemas                                                                                                                              |
| Generated types                | Existing-project `pnpm db:types:check` matched; formatted clean-project generated types matched byte-for-byte                                                                   |
| Draft contract parity          | `pnpm test:draft-contract`: 214 passed                                                                                                                                          |
| Editor parity                  | `pnpm test:draft-editor`: 8 passed                                                                                                                                              |
| Independent sessions           | `pnpm test:draft-concurrency`: 57 passed in 18 files                                                                                                                            |
| Production build               | Passed through configured Playwright web-server builds                                                                                                                          |
| Browser journeys               | Initial full run: 94 passed, 12 desktop failures, 3 skipped and 27 not run. Entire desktop project rerun: 68 passed with one worker; all 65 mobile cases passed in the full run |
| Production dependency audit    | No known vulnerabilities                                                                                                                                                        |
| Full dependency audit          | High/critical threshold passed; one moderate development-only minimatch advisory remains                                                                                        |
| History secret scan            | Gitleaks v8.30.1: 320 commits scanned, no leaks found, covering the application-code commit                                                                                     |

Initial unbounded unit execution hit three five-second timeouts while other local verification services were busy. Repeating with two workers passed every test without changing assertions or timeouts. Initial generated-type checking failed once; the subsequent existing/clean checks matched. The first Docker history-scan invocation could not follow the linked worktree's Git path and scanned zero commits; mounting that Git metadata read-only produced the successful scan above. These failed attempts are not counted as passes.

The full browser run's desktop failures rendered safe server-error pages with `Unable to verify membership access`; mobile then completed all 65 cases with no failures. Rerun the entire affected desktop project with `pnpm test:e2e --project=desktop --workers=1`, retaining all assertions and configured timeouts. The rerun passed all 68 desktop cases. Across these runs, 133 browser cases passed and three mobile shared-state writes were intentionally skipped. This demonstrates the tested desktop journeys but does not establish a root cause for the intermittent local API failures or claim one clean default full-suite run.

### Upgrade and clean installation

A separate project, `gavel-phase4-db-proof` on ports 573xx, started with exactly the 15 migrations and seed from Phase 3 commit `1285933`. Added synthetic draft/NULL-body, published/canonical-body and archived/legacy-body articles; category/tag links; guest multi-role credits; an existing revision/audit and a legacy create receipt. Snapshots captured all original columns across 15 public/private/Auth tables, 26 rows. The CLI applied all subsequent migrations, including the two authorization corrections, to the populated database.

All original values were preserved except `profiles.updated_at` changed by the intended published-profile slug-freeze backfill. Article IDs, owner/status/publication dates, public slugs, content, associations, revision/audit payloads, Auth fields and the legacy receipt remained intact. Added version/freeze/registry fields are migration backfills, not proof of newly authored history. Synthetic snapshots, the baseline-column list and comparison result remain under `/private/tmp/gavel-phase4-db-proof`; the local proof helper was `/tmp/gavel-phase4-upgrade.py`.

Only after saving upgrade evidence, `pnpm supabase db reset --local --workdir /private/tmp/gavel-phase4-db-proof` applied the complete 77-migration chain from scratch. SQL tests, schema lint and generated types then passed. Studio/realtime/logflare/vector were excluded only in this disposable local project to avoid the previously observed duplicate-stack health problems; CI retains its full service configuration. The disposable services were stopped with `--no-backup` after verification.

### Authorization review and corrections

Fresh whole-phase agent review covered new migrations, grants, Storage policies, routes/actions, domain operations and import boundaries against Phase 3. It found two Important issues:

1. Trusted upload claiming/finalization and removal completion cached actor authority before resource-lock waits. Nine independent-session cases reproduced success after demotion, membership deactivation or profile deactivation committed ahead of the request. Forward migration `20261109010000` locks supplied-actor Auth, membership and profile rows, then rechecks eligibility and role. All nine regressions pass; helper EXECUTE remains denied to application/service roles and public RPC signatures/grants stay unchanged.
2. Inherited read predicates omitted caller profile activity. Checked contributor deactivation hid the dashboard but left direct own-article/media reads, or administrator cross-owner reads, available. Six of the initial eleven direct-denial assertions failed. Forward migration `20261109010100` requires an active caller profile. Final SQL coverage includes positive Storage-operation context, inactive owner/admin denials, remaining-admin access and helper-grant denials; the complete 1,590-assertion suite passes.

The destructive confirmation also incorrectly said media-bearing articles could not be deleted; it now states that image removal can continue after article deletion. Focused review of the corrections found both Important issues addressed and no new Critical/Important finding. The reviewer did not rerun the suites and does not supply human maintainer approval.

### Accessibility evidence

Configured desktop/mobile journeys exercise semantic landmarks, focus/navigation, form labeling, keyboard controls, confirmation and pending/error states, image alt text, no-JavaScript access/read paths and responsive behavior. This is automated evidence only. No routine screenshots were added; browser-generated changes to historical evidence images were discarded. Human screen-reader testing and WCAG certification are not claimed.

## Review and remaining launch gates

- The owner must verify the final PR commit's `foundation` hosted check. CI monitoring is explicitly delegated; no exact-head pass is asserted here.
- Human maintainer security/code approval remains required for the authorization migrations, uploads and content/deletion operations. Human screen-reader checks remain outstanding.
- Real Google OAuth issuance/refresh/logout, hosted headers/provider/environment separation, service-role/cron credentials, initial cleanup health, capacity/alerting and backup/recovery exercises remain launch requirements.
- Full audit reports development-only `minimatch@10.2.6`, GHSA-g3hv-75wg-m249 (moderate), through ESLint tooling. The high/critical gate passes without an ignore. Production audit is clean; do not describe the full dependency tree as vulnerability-free.
- Approved video providers and profile-image contracts remain unresolved/gated. Public article routes, archives/search, public media and homepage/site composition remain Phase 5 work.
- Normal application rollback can retain the stricter read predicates and media actor locks; do not roll back to the demonstrated authorization gaps. No table/data removal is needed for these fixes.
