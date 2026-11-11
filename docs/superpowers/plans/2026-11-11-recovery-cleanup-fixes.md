# Review fixes 28, 5 and 6

## Scope and acceptance

Base: main after PR 78; PRs 79 and 80 remain separate. Fix cleanup fairness, stuck uploads and definitive save-conflict recovery. Run focused regression cases only after implementation; leave broad checks to CI.

- 28: alternate prefix and key batches per bounded round. A slow prefix batch must not skip that round's key batch. Keep permanent tombstones, leases and unhealthy backlog reporting. The 40-second budget is soft: at most the current round may finish after it.
- 5: allow explicit removal of unreferenced uploading assets through existing actor/article/asset locks. Preserve the owner-approved published-unused cleanup scope from PR 79. Cancellation moves to deleting before Storage removal; finalization then rejects it. Asset deletion retires its permanent key for repeated removal of late writes. No automatic expiration. Surface trusted begin/finalize business errors as 4xx, leaving network/unknown responses as retryable 503.
- 6: release an uncertain save handle only for conflict/request_conflict responses after receipt lookup; retain uncertain handles on authorization or missing-resource denials. Preserve local input and expose conflict recovery.

## Risks and verification

Verify cleanup progress across repeated slow rounds and failures; exact upload retry and denial mapping; SQL role/owner/reference denials and cancel/finalize ordering; save uncertainty, conflict adoption and newer edits. Migrations are additive function replacements with no data rewrite or new grants; rollback restores prior function definitions but reintroduces stuck claims. Existing retired-key registry remains permanent.

## Verification after implementation

- Eight focused Vitest files: 73 cases passed for cleanup worker/actions, upload route, save reducer/keys and form/command behavior. Includes repeated five-second prefix batches, over-budget 41-second calls, failed scans, preserved local edits, conflict review, denial retention and upload business errors.
- SQL: 19 existing removal assertions and 7 cancellation assertions passed on disposable `gavel_recovery_20261111`, cloned from the prior review scratch database. Applied main's finalization-lock replacement and this cancellation migration only to that clone. Confirms ownership/reference denials, publication interruption, idempotent cancellation, rejected late finalization and permanent ledger retirement.
- One targeted two-session cancellation/finalization race passed; five unrelated cases were skipped by the name filter. A temporary test-only Docker wrapper redirected psql from the working database to the clone; it is not committed.
- TypeScript, targeted ESLint, targeted Prettier and diff checks passed. No working database reset/migration occurred. Full browser, SQL, concurrency, dependency/security and clean-install gates remain for CI.

Initial verification corrected two test-fixture mistakes: retry dispatch must reuse the reducer's cloned pending handle, and the race session must authenticate as the synthetic owner. The final focused reruns passed. Reviewed all three slices and the final diff once before PR creation. Human security/maintainer review remains outstanding.

## Integration with merged PR 79

Merge main `ede546d` without rewriting shared history. Retain processing admission before buffering, bounded processing slots and unconditional slot release together with trusted begin/finalize business-error mapping. Keep both sets of route regression tests and both data-model notes. Acceptance: admission cannot be bypassed, exact retry and ownership denials remain intact, cancellation still fences finalization, and conflict recovery retains local edits. Run focused route/media/cleanup/save tests, types, lint and formatting; full database/concurrency/browser gates remain in CI. No database reset is needed for conflict resolution.

Integration verification passed: 127 focused tests across 13 files covering upload route admission/business errors, cleanup/actions, unused uploads, save state, form/command guards and media; `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, targeted documentation formatting and diff checks. Independent review found no actionable issues. Database, concurrency and full browser/security suites remain hosted CI gates. No working database reset/migration, merge to main or deployment occurred.

## PR 81 CI SQL integration correction

Hosted run `43112191382` failed only assertion 9 in `052_unused_article_uploads.test.sql`: the inherited test expects an uploading asset to reject removal, while this PR intentionally permits explicit owner/admin cancellation. Update that assertion to the approved behavior and verify the deleting state and exact cancellation retry; retain all reference, ownership, inactive and archived denials. Reproduce the mismatch on the existing disposable recovery database, then rerun the unused-list/removal/cancellation SQL files. No application or migration change is needed.

The inherited failure reproduced before editing (24 passed, 1 failed). After correction, 53 focused assertions passed: unused-upload discovery/cancellation (27), media removal (19) and interrupted-upload cancellation/finalization fencing (7). Targeted documentation formatting and diff checks passed. Application code, migration, grants and the working database are unchanged; full hosted CI remains required.
