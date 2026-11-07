# Administrator Taxonomy Implementation Plan

**Goal:** Manage existing sections and categories safely, while keeping unresolved taxonomy and tag normalization decisions gated.

**Basis:** [Phase 4 contract](../specs/2026-11-01-editorial-workflow-design.md) and [Task 11](2026-10-29-phase-four-editorial-controls.md). Stack on Task 10 integration PR #40.

## Decisions and risks

- The task edits existing section/category names, navigation order, and active state. Existing IDs, slugs, parent relationships, and article links remain fixed. No new categories, deletes, tag mutations, or editable slugs are introduced. `Outside of BC` cannot be renamed while its client decision remains unresolved. Tags are read-only until normalization is approved.
- Checked section/category operations derive the administrator from verified Auth, accept a request UUID and expected version, and record one allowlisted audit event plus immutable receipt atomically. No-op writes record a receipt only. Stale versions return conflict; uncertain responses retain the original request for retry.
- Section deactivation is blocked by published or archived articles in that section; category deactivation is blocked by published or archived category links. Draft references remain untouched and existing draft validation rejects inactive selections. A category cannot be activated under an inactive section.
- Publication and draft validation already acquire section then category share locks. Mutation operations take the same lock order, then recheck references after waits. Test concurrent publication/deactivation so neither interleaving creates invalid live references. Preserve last committed state and audit on denial or rollback.
- Administrator directory and controls expose bounded safe summaries and no private identity fields. Native controls require confirmation for deactivation and provide explicit conflict reload, uncertain retry, and no-JavaScript guidance.

## Slices and verification

- [x] Database tests cover authority, direct-write denial, reference/parent integrity, unresolved label protection, retries, no-op and stale versions. Forward migrations add versions, receipts, checked operations, bounded reads and closed audit actions; generated types match the local schema.
- [x] Independent sessions prove both publication/deactivation interleavings. Existing draft selection tests verify stale inactive selections fail without dropping links; new tests verify published/archived links remain intact.
- [x] Guarded queries/actions and administrator controls include uncertain retry and conflict reload. Focused tests and desktop/mobile browser cases cover section/category editing, author denial, cursor recovery and read-only tags.
- [x] Final review and cohesive commits are complete; [Task 11 PR #41](https://github.com/dylandrozario/the-gavel/pull/41) is stacked on PR #40. Local checks passed: 1,420 pgTAP assertions, 582 unit tests, 38 concurrency cases, four desktop/mobile browser cases, schema lint, types and targeted lint/format. The last retry-state change passed its focused tests. Clean rebuild and hosted CI remain pending. Retarget PR #41 to main after #40 merges and before merging #41.

**Acceptance:** Only eligible active administrators manage existing section/category fields; live/archived references remain valid and drafts are never silently rewritten. No unresolved category names or tag normalization rules are invented.
