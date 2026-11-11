# Remaining optimizations and low-priority fixes implementation plan

> **For agentic workers:** Execute the independent slices below with focused ownership. Write regression coverage alongside changes, but run tests only after all implementation is complete, as the user requested. Use one independent final review.

**Goal:** Complete O2–O4 and low-priority findings 10/11, and investigate 19 without labeling valid URI encoding as a demonstrated bug.

**Architecture:** Reuse the existing editor state, checked private media boundary, anonymous homepage projections and PostgreSQL pagination. Add only additive database functions/tables/indexes required by the requested outcomes. Keep public paths, existing RPC signatures and authorization model compatible. No new dependency, service, automatic retention policy or general background worker.

**Baseline:** `perf/review-optimizations` from corrected PR #77 head `1dfa5bd`, in managed worktree `/Users/dylandrozario/.codex/worktrees/25a2/the-gavel`. The uncommitted second batch remains separate in worktree `cc50`; do not copy or publish it implicitly. Recheck parent merges before a future PR.

**Spec:** [Review](../../reviews/phase-1-5-pr-review.md). Read README and relevant architecture/component/data/API/security/coding/testing/workflow docs before each owning boundary.

## Approved scope and design choices

- User authorized planning and building all remaining optimizations and low-priority fixes together, with only specific tests after implementation.
- User explicitly chose manual cleanup of unused uploads, including on published articles, with owner/admin and reference checks. No automatic expiry/deletion is introduced. Archived articles retain their current read-only workflow.
- Upload attempt admission uses a separate per-actor bucket of 30 processing attempts per 60 seconds, matching the existing draft-write numeric limit without consuming draft-save quota. Fast finalized replays remain free. A small per-process cap bounds active multipart/Sharp jobs; distributed enforcement comes from PostgreSQL, not process memory alone.
- All database additions are forward migrations, deployed before application consumers. Retain old full-homepage and editor APIs. Application rollback can leave additive functions/indexes in place; no source data is rewritten or existing local database reset.
- Profiling/query-plan observations are design evidence. They are not a pre-change passing test claim. All regression tests and final validation run after the batch.

## Slice A — O2: reduce editor body traversals

- Reuse the canonical body comparison key while an immutable form-owned body is unchanged, without changing the behavior of general mutable-input helpers or canonical equality.
- Skip conversion of native editor echoes before the emitted-object shortcut, retaining delayed-echo protection, external reloads, native-invalid tracking and immediate-submit correctness.
- Add focused tests for metadata-only edits, real body edits, delayed echoes, externally loaded content and invalid native content. Record operation-count or representative fixture timing evidence; do not claim an unmeasured user-visible speedup.

## Slice B — O3: narrow footer projection

- Add `get_public_read_this()` returning only checked current Read This cards, using the existing shared slot resolver and eligibility/card map. Do not introduce cross-request caching, caller cookies or private fields.
- Preserve a single full-homepage snapshot for homepage content/footer, and avoid full composition for other public routes. An internal route-group split with a shared server shell is acceptable if needed; public URLs, existing not-found recovery and navigation behavior must remain compatible.
- Reserve migration `20261111060000_public_read_this.sql` and SQL test `049_public_read_this.test.sql`. The lead owns generated types; do not hand-edit them concurrently.
- Verify empty/fallback/curated/archive behavior, anonymous/authenticated equivalence, unsafe output and narrow layout calls. Document any internal route ownership move.

## Slice C — O4: admin pagination index

- Measure representative broad admin `(updated_at DESC,id DESC)` pagination with `EXPLAIN (ANALYZE, BUFFERS)` in a disposable local database/rolled-back synthetic fixture, never by resetting a working project.
- Add a simple matching index only if the plan demonstrates avoidable sorting/scanning. Do not add a status-prefixed index without separate evidence.
- Reserve migration `20261111060200_admin_article_pagination_index.sql`. Keep filtering, cursors, ties, RLS and output unchanged. Record storage/write tradeoff and an additive rollback path.

## Slice D — finding 10: admission before image processing

- Reserve migration `20261111060100_upload_processing_admission.sql` and SQL test `050_upload_processing_admission.test.sql`.
- Add a checked caller-scoped admission RPC using existing actor locks and owner/admin rules, with private per-actor state. Charge pending/uploading attempts before body reading or Sharp; denial and exhausted quotas must not allocate/process/delete media. Retain exact reservation/upload retries.
- Bound concurrent buffered/decoded jobs per process without a growing queue; release permits on every error and success. Reject excess transient load safely; do not misrepresent the local cap as deployment-wide.
- Update main/body image clients so HTTP 429 retains the original file/reservation instead of treating a throttle as a permanent rejection requiring cleanup.
- Cover anonymous/inactive/foreign-owner denial, 30/31 attempts, another actor, window reset, finalized replay, processor-not-called on denial, permit release and client retry retention.

## Slice E — finding 11: explicit unused-upload cleanup

- Reserve migration `20261111060300_unused_article_uploads.sql` and SQL test `052_unused_article_uploads.test.sql`.
- Expose a bounded, owner/admin-only listing of finalized unused assets on draft/published articles, returning IDs/timestamps only. Current body, main image and retained revision references exclude assets from the unused list.
- Permit explicit removal of unused assets on published articles using the same actor, article, asset locks and reference checks as existing draft removal. Retain the deleting state across uncertain Storage results; do not grant public asset listing or direct writes.
- Show the discoverable list in the existing editor for both statuses, with explicit discard/retry and safe empty/error states. Suppress misleading cleanup controls for images present only in current unsaved local input, and refresh/recheck after writes. A saved reference always defeats concurrent removal.
- Cover insert/remove-before-save, tab reload discoverability, publication before cleanup, cross-owner/credited denial, reference-retained refusal, uncertain cleanup retries and cleanup/save races. No automatic cleanup on unmount/unload or arbitrary retention window.

## Slice F — finding 19: mailto verification

- Inspect the existing mailto contract and URI handling before claiming a failure. If percent-encoded `@` is valid and no concrete client failure is shown, reclassify this as an unproven interoperability concern rather than inventing a fix.
- If sharing already-approved contact-link construction removes an actual inconsistency, keep exact mailbox/local-part escaping and test reserved characters. Do not add an email service or change contact-address validation.

## Final gates, after implementation

- Focused editor/save-state/body-image/media-route/public-footer/query tests, strict types, changed-file lint/format and import boundaries.
- Apply additive SQL only to a dedicated disposable local database, generate types from its exact schema, and run only new/affected SQL and targeted independent-session races. No working-project reset/migration.
- Run only the new/affected browser scenarios necessary for user-visible cleanup and public shell/route ownership changes. Leave full unit/browser/SQL/concurrency suites, hosted checks and security scans to CI; explicitly report any unrun local gate.
- One independent final review, then fix important findings and rerun only affected proof. Record commands/counts and limits here. Do not mark implemented behavior verified before those checks pass.

## Execution evidence

All six slices are implemented locally. No commit, push, pull request, merge or deployment is claimed. The independent final review and its delta review found no actionable defect.

### Decisions and measurements

- O2 reuses the content key only while the form retains the same immutable body identity; the general helper still recalculates mutable inputs. The getter-based 100-paragraph fixture proves 20 metadata edits add no body traversal. Native documents carry a per-editor nonenumerable Symbol before emission, avoiding conversion of exact echoes without reading refs during render. JSON, canonical key enumeration and the structured clones used for Server Action commands omit this marker. External cloned reloads still convert and validate. No typing-latency or maximum-body timing improvement is claimed.
- O3 returns only four checked footer cards on non-home routes. The homepage retains its request-local full composition for both page and footer. SQL proves identical cards/fallback and demonstrates that unrelated 100-section overflow does not break the narrow footer. No SQL-time, response-byte or TTFB benchmark is claimed.
- O4 profiling used a schema-only clone in database `gavel_opt_index_20261111`, PostgreSQL 17.11, and 10,000 synthetic articles. Three administrator first-page runs dropped from 4702.616–6756.589 ms to 9.391–15.348 ms; continuation dropped from 2208.077–3448.290 ms to 10.079–18.576 ms. Warm shared hits fell from 330270 to 748 and 165233 to 875 respectively. Plans changed sequential scans/top-N sorts to the matching index. This is synthetic SQL/RLS evidence, not an HTTP or production speedup. The unchanged OR cursor still filters the 5001-row newer prefix. The index occupied 416 KiB on a 1.8 MiB heap; timestamp writes now maintain another B-tree, generate WAL and cannot use HOT. Write overhead is unmeasured. Ordinary CREATE INDEX requires an acceptable write pause. Application rollback may leave it; database rollback drops `public.articles_updated_page_idx`.
- Upload admission uses a separate distributed 30/60-second actor bucket and a conservative two-job process-local gate, before application body parsing/Sharp. Existing 10 MiB/24-million-pixel input bounds remain. Two jobs is not a measured total-memory guarantee or deployment-wide capacity; hosted capacity tuning remains operational work. No platform-level request-buffering claim is made.
- User approved explicit cleanup including published articles. Listing is bounded and reference-aware; removal never follows automatically from listing, timeout, refresh or unmount. Unsaved body references are hidden, and uncertain cleanup retains save/lifecycle/navigation guards until explicit retry resolves. Archived articles remain read-only.
- Finding 19 is a shared-construction consistency improvement, not a reproduced mail-client failure. The shared helper preserves a literal address separator and escapes reserved local-part characters under [RFC 6068 section 2](https://www.rfc-editor.org/rfc/rfc6068.html#section-2). No mail delivery behavior was tested.

### Focused verification after implementation

- `pnpm exec vitest run` with the changed editor/save-state/form, upload route/gate/main/body controls, unused-upload action/widget, homepage/layout, contact/header and import-boundary paths, plus `--maxWorkers=2`: **142 tests across 22 files passed**. The exact selected paths are the owners listed in the slices above; full unit suites are left to CI.
- Five explicit SQL files (`049`, `050`, `051`, `052`, `016_media_removal`) run with psql/pgTAP: **92 assertions passed**. Only the disposable database received the new migrations. Existing working-project schema and content were preserved. The clone omitted pgTAP and bucket data, so pgTAP and the migration-defined synthetic bucket configuration were added only there. Profiling rows were removed before count-sensitive assertions.
- `pnpm exec vitest run --config scripts/draft-concurrency/vitest.config.ts scripts/draft-concurrency/upload-admission-races scripts/draft-concurrency/unused-published-races`: **3 tests passed**, proving last-quota-slot serialization and both published save/removal lock orders. A temporary test-only Docker transport redirected the existing hardcoded psql database to the disposable database and used its migration owner for fixture setup; authenticated sessions still assumed the real authenticated role.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `git diff --check`: passed on the final code and artifact set. Generated database types came from the disposable exact schema using `supabase gen types --db-url`, then Prettier; the diff contains only the three additive public RPCs.
- `pnpm exec playwright test e2e/public-shell/public-shell.spec.ts --workers=1`: production build and four desktop/mobile shell cases passed with JavaScript enabled/disabled on the final code. The browser stack uses the unchanged working local database, so non-home footer reads exercise unavailable recovery for the not-yet-deployed RPC. Actual new footer SQL is covered separately by the disposable database assertions.
- Added the cleanup browser scenario to `e2e/drafts/body-images.spec.ts`; local end-to-end execution is deferred to CI because the disposable SQL database has no separate Auth/Storage/API stack. Local action/widget/form tests and real SQL/races cover cleanup, reference denials and retries. Full unit/SQL/concurrency/browser suites, clean rebuild/type drift, hosted checks, security scans and human review remain CI/release gates.

Initial failures were corrected before passing reruns: two invalid archived fixture timestamps, a published race fixture missing publication prerequisites, missing clone-only pgTAP/bucket configuration, and clone migration-owner fixture permissions. Initial concurrent import-boundary testing exceeded its existing 5-second timeout; bounded-worker final testing passed without changing the test timeout. Full lint found render-time ref access and effect-triggered synchronous state updates; both were redesigned without suppressions.

## PR 79 CI regression correction

CI exposed strict JSON validation rejecting the editor's non-enumerable Symbol ownership marker. Native document ownership now lives in a per-editor WeakSet, preserving delayed-echo protection without modifying documents. Editor regressions validate emitted documents through the actual draft contract.

The new unused-upload list action also contaminated two browser fixtures that captured every server action. Capture now filters the create route or the versioned save payload. The keyboard create flow waits for the submit button to become enabled before traversing tab stops. No authorization or schema contract changed.

Validation: the original owner edit failure reproduced before the patch; six editor tests, targeted ESLint, formatting, and TypeScript passed after the patch. All 24 desktop/mobile create and edit browser cases passed (`pnpm test:e2e e2e/drafts/edit-drafts.spec.ts e2e/drafts/create-drafts.spec.ts --workers=1`), including role denials, lost-response retries and near-limit saves. The existing local Supabase schema was not changed; cleanup browser coverage still requires CI’s migrated database. Full CI remains the merge gate.

## Main integration after PR 78

Merged `origin/main` at `fc43967` into the PR branch without rewriting history. Resolved overlapping image form guards by retaining both cleanup and media busy checks, preserving main's version acknowledgement and exact retry behavior. Retained both branches' regression tests and authoritative documentation additions. Updated STATUS.md to reflect integration. Validation: 66 tests across seven media/form/save-state files, TypeScript, targeted ESLint, full formatting check and diff checks passed. Hosted CI remains required.
