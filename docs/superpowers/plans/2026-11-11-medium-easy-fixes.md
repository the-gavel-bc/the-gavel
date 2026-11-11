# Easiest medium review fixes

## Scope and acceptance

Implement findings 7, 26 and 25 from the PR review. The user requested selection, planning and implementation together, with focused tests only after all fixes are implemented. These are narrow corrections to existing behavior; no authorization, lifecycle, public URL or retention policy changes are proposed.

This isolated branch, `fix/review-medium-easy`, starts at corrected PR #77 head `1dfa5bd`. The separate uncommitted low-priority batch in `25a2` and second batch in `cc50` remain untouched. This branch can be reviewed independently; reconcile overlapping form/media edits when stacking later.

## Design and task order

1. **Finding 7 — preserve form edits across image writes.** Add an article-version acknowledgement event to the existing save reducer/hook. Image completion advances only the same article's version/time, preserving current input, acknowledged content, invalid-native tracking and dirty state. Never replace the current form using the callback's captured draft. Ignore wrong-article, regressing-version or pending-draft-command acknowledgements. Test metadata/body edits made while the image action is deferred, then save with the confirmed new version. Locking the entire editor was considered but would unnecessarily interrupt editing.
2. **Finding 26 — exact media retries.** Store article ID, expected version, request ID and complete payload as one command. Provide an explicit retry independent of current metadata. Preserve newer alt/credit edits after a successful retry, while attached-image state reflects the confirmed command. Block new attachment/removal/upload/cleanup operations while a command remains unresolved; do not discard its asset. Keep retries reachable when newer form edits would normally disable image management. Do not alter existing authorization or introduce automatic retries. Cover lost responses, changed metadata, newer props, exact command replay, removal and definitive conflict recovery.
3. **Finding 25 — consistent upload locks.** Forward migration `20261111060400_media_finalize_lock_order.sql` changes finalization to read an asset locator without locking, then lock article before asset and recheck both. Retain actor locks and every existing owner/admin, lifecycle, object, dimensions, hash and replay check. No schema/signature/grant change or data rewrite. Add missing-row checks after waits. Verify both begin/finalize lock orders using independent sessions and retain existing revocation-denial races.

## Risks and recovery

- Media operations must not overwrite newer text or metadata, move article versions backwards, or submit a new request while the original outcome is uncertain.
- Pending draft commands and image actions must remain mutually exclusive. Retry must stay reachable even if current input is dirty; successful recovery must leave newer input dirty and saveable.
- Finalization must lock actor, article and asset consistently and observe authority after waits. Missing/deleted rows must fail closed. Existing mixed-provider eligibility finding 24 is deferred; this change must not weaken its current checks.
- Application rollback restores previous frontend behavior. Database rollback may reapply the prior function definition, but would restore the known lock inversion. No data recovery is required.
- Findings 5/6 require broader uncertain-write recovery decisions; 24 concerns identity/last-admin consistency; 28 changes cleanup scheduling. They remain outside this easiest-medium batch.

## Final verification

Write regression coverage with each slice, then run it after all implementations. Run only changed reducer/hook/form/media tests, strict types, lint/format, affected media SQL and targeted real-session races. Use the existing disposable synthetic database, never reset/migrate the working project. A fresh independent review checks the complete diff. Leave full unit/browser/database suites, hosted security scans and clean-install verification to CI. Record exact results and unresolved limits below. No automatic commit, PR, push or merge.

## Evidence

All three slices are implemented locally. No commit, push, pull request, merge or deployment was performed.

### Decisions and review

- Form edits remain enabled while image writes are in flight. Only the article-version acknowledgement changes after image success; the existing current/acknowledged input, dirty key and invalid-native state remain intact. Draft saves and lifecycle actions are blocked during busy or pending image operations.
- The retained media command also records whether its outcome became uncertain. Independent review found that a later authorization or missing-resource denial could still discard a possibly committed command. Both occur before receipt lookup; they now preserve the exact handle until access returns and its receipt can be recovered. Conflict/request-conflict occur after receipt lookup and retain definitive recovery. Focused tests cover both denial/restoration paths and normal first-attempt denial. The independent delta review confirmed the finding resolved and reported no further actionable issue.
- Only finalization needed its lock order changed. Its signatures/grants, actor helper, metadata validation and replay output remain unchanged, so no generated database type update is necessary. The broader eligibility finding 24 is not addressed.

### Commands and results

Checks ran after all initial implementations; the review correction was followed by only affected reruns.

- `pnpm exec vitest run src/frontend/features/articles/draft-save-state/draft-save-state.test.ts src/frontend/features/articles/components/draft-form src/frontend/features/articles/components/article-media --maxWorkers=2`: 44 tests across five files passed initially, including seven reducer cases. After the review correction, `pnpm exec vitest run src/frontend/features/articles/components/article-media src/frontend/features/articles/components/draft-form --maxWorkers=2` passed 39 tests across four files. Together, the final unchanged reducer and rerun set cover **46 distinct tests**.
- Explicit psql/pgTAP runs of `053_media_finalize_lock_order.test.sql`, `016_media_reservation.test.sql` and `016_media_removal.test.sql`: **68 assertions passed**. Only migration `20261111060400` was applied to the existing disposable synthetic database `gavel_opt_index_20261111`; no working-project migration or reset ran. That disposable database also contains the preceding low-priority batch migrations; a clean branch-only rebuild remains CI work.
- `pnpm exec vitest run --config scripts/draft-concurrency/vitest.config.ts scripts/draft-concurrency/media-finalize-locks scripts/draft-concurrency/media-actor-races`: **14 tests passed**. Five new independent-session cases cover both lock orders and disappearance during article/asset waits; nine existing cases retain demotion, membership and profile-revocation denial. The temporary test-only Docker transport redirects the hardcoded test database to the disposable database and uses its schema owner for fixtures; service/authenticated role checks remain real.
- Final `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `git diff --check`: passed. Changed plan/review/status Markdown receives a separate Prettier check.
- Full unit, database, concurrency and browser suites, production build, clean-install/type drift and hosted security scans were deliberately left to CI. No local browser or build pass is claimed. Human maintainer review remains required for upload/database changes.

Earlier uncommitted batches and their worktrees remain untouched. This branch starts at `1dfa5bd`; future stacking must reconcile overlapping reducer/form/media edits rather than replace either batch. Findings 5/6/24/28 and the matched-resource no-JavaScript 404 blocker remain outside this batch.
