# Phase 2 Content Foundation Task Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement an approved execution plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the article and taxonomy data foundation, with tested ownership and database permissions, before building the editor.

**Architecture:** Extend the existing local Supabase schema and RLS boundary through additive migrations. Preserve server-side membership checks and database enforcement. Keep related implementation/tests together under the approved colocation convention once its integration reaches main.

**Tech Stack:** Existing Next.js/TypeScript application, Supabase PostgreSQL and CLI, pgTAP, generated database types, Vitest, and GitHub Actions. No new dependency or external service is approved by this plan.

**Spec:** [Approved MVP design](../specs/2026-10-16-the-gavel-mvp-design.md), [product requirements](../../product-requirements.md), [data model](../../data-model.md), [API contracts](../../api-contracts.md), and [security matrix](../../security-and-permissions.md#authorization-matrix).

**Status:** The owner instructed execution of these tasks on 2026-10-20. Task 0 verification is in progress; Task 1 has a [proposed contract](../specs/2026-10-21-content-foundation-design.md) awaiting the owner’s schema decisions; this authorizes the content-foundation work sequence, not unresolved schema decisions. Task 1 must settle schema-affecting decisions and produce an approved, executable design before dependent implementation begins. The editor remains a later phase. No unresolved product decision or client answer is selected here.

## Proposed scope and outcome

At the end of this phase, the database can represent taxonomy, owned draft articles, valid category/tag/contributor relationships, and protected history. Tests prove the role boundaries and relational invariants. Generated types and documentation match the schema. Normal application screens remain the foundation shells; this phase does not claim a usable editor or publishing workflow.

Rich-text editor UI, uploads/Storage, publishing/archive/restore/delete operations, public article/search/archive pages, homepage curation, administrator screens, and hosted deployment belong to subsequent focused plans. A later workflow must implement atomic writes and lifecycle checks before exposing mutations. Merely adding enum values or history tables does not implement those behaviors.

## Global constraints

- Preserve the approved `draft`, `published`, and `archived` lifecycle and owner-versus-credit distinction. Do not add editorial approval, scheduling, comments, newsletters, or legacy imports.
- Use Node.js 22 and `pnpm@11.25.0` as currently pinned. Retain existing dependencies unless a separately reviewed need is established.
- Use local Supabase and synthetic fixtures only. No hosted account setup is required for the proposed schema work.
- RLS and explicit grants ship in the same migration as each exposed table. Do not defer denial tests to the final task.
- Reuse trusted-identity and active-membership enforcement. Do not expose elevated credentials or allow client-supplied ownership to grant authority.
- New tables and helpers must not weaken profile/membership access. Privileged functions need fixed search paths and narrow grants.
- No destructive migration or policy relaxation is authorized. Keep earlier migrations immutable; verify clean reset and upgrade from the actual previous schema.
- Task 1 must define how approved operations interact with revisions/audit before client write grants or mutation functions are exposed. Until then, new write surfaces remain closed.
- Seed only synthetic test data and confirmed content labels. Unresolved News categories, Features naming, navigation placement, retention, or footer decisions remain unresolved in the product requirements.
- Make one focused, reviewable commit per implementation task, including its tests and affected documentation. Pause after each task for the owner's review, as requested in the existing working agreement.

## Starting state and carry-forwards

- Planning baseline: main `a3bb502aaea39b1cafaa2277444322e7b6511928`. Its [hosted run 39448856662](https://github.com/dylandrozario/the-gavel/actions/runs/39448856662) passed when checked on 2026-10-20.
- PR #3’s documentation cleanup and PR #5’s task plan are merged. PR #6 integrated the folder refactor into main at `3c1a2412b0cb349d00300541f584b8c1b59a5dff` on 2026-10-21. The original CI run for that exact merge was cancelled; a fresh main-branch run was dispatched to verify the integrated baseline. The source paths now exist on main; final Task 0 completion still requires successful CI for that exact commit.
- The [Phase 1 review record](../../reviews/phase-1-foundation.md) still tracks human review. No solo-maintainer policy exception has been approved. Proceeding with planning does not close that requirement.
- [Session issuance/refresh/logout coverage](../../testing.md#session-coverage-still-needed-before-hosted-launch) remains pre-launch work. Existing synthetic browser sessions do not verify real Google login.
- [ADR 0005](../../decisions/0005-temporary-ci-audit-exception.md) remains the only approved audit exception; remove it when compatible upstream remediation is available.
- Auth-user deletion semantics remain unresolved in ADR 0003; ordinary membership deactivation remains the supported path.

## Review focus

Each condition must be pinned by the named task's direct SQL tests, not only UI behavior:

1. Author A cannot read Author B's draft, forge another owner, or gain authority by receiving a credit — Tasks 3 and 5.
2. Changing an article's primary section cannot leave its existing categories attached to the wrong section — Task 4, testing updates from both sides of the relationship.
3. Direct Data API/SQL operations cannot bypass a missing server check, activate publication, or change protected ownership/history fields — Tasks 2–6 under the Task 1-approved matrix.
4. Repeated association inserts, equivalent tag names, and deleted referenced records cannot produce duplicates or dangling relationships — Tasks 2, 4, and 5 using approved normalization/deletion rules.
5. An upgrade from populated foundation tables preserves users/memberships and all existing denials; reset-only success is insufficient — Task 7.

## File ownership and dependencies

The following are planned file locations, not implemented files. Reserve actual migration timestamps when implementation starts; do not rename already-applied migrations.

| Owner                      | Planned locations and responsibility                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content contract           | `docs/superpowers/specs/2026-10-21-content-foundation-design.md`; accepted storage, permissions, constraints, and deferred fields                              |
| Schema                     | New additive files in `supabase/migrations/`; existing foundation migrations stay unchanged                                                                    |
| Taxonomy assertions        | `supabase/tests/004_content_taxonomy.test.sql`                                                                                                                 |
| Article assertions         | `supabase/tests/005_article_access.test.sql`                                                                                                                   |
| Category assertions        | `supabase/tests/006_article_categories.test.sql`                                                                                                               |
| Tags/credits assertions    | `supabase/tests/007_article_tags_contributors.test.sql`                                                                                                        |
| History assertions         | `supabase/tests/008_content_history.test.sql`                                                                                                                  |
| Fixture data               | `supabase/seed.sql`, synthetic content using fixed local identities                                                                                            |
| Types                      | `src/lib/supabase/database/database.types.ts` after the colocation integration; regenerate through the relocated package script                                |
| Authoritative requirements | `docs/data-model.md`, `docs/security-and-permissions.md`, `docs/api-contracts.md`, `docs/testing.md`; avoid copying schema definitions into multiple documents |

Tasks proceed in order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. If a task is too large for one review, split its named deliverables before coding rather than expanding a commit mid-task.

## Tasks

### Task 0: Establish the integrated baseline

**Deliverable:** A known main commit containing both documentation cleanup and file colocation. This is integration work, not a new refactor.

- [x] Verify current branch/PR state; open a focused follow-up PR for the already-reviewed colocation commit if it is still missing from main. [PR #6](https://github.com/dylandrozario/the-gavel/pull/6) targets main and contains only `f220aee`. Do not push directly to main or silently merge it.
- [ ] After integration, confirm the new paths and capture that commit's hosted CI result.
- [ ] Update this plan's baseline evidence without claiming the outstanding human review is complete.

**Acceptance/review:** The main tree contains the requested organization; its CI passes. Owner reviews the integration before schema work. No new product behavior.

Task 0 execution record (2026-10-20): GitHub reports PR #6 as mergeable. Its [current CI run](https://github.com/dylandrozario/the-gavel/actions/runs/39515089794) passed; an [earlier run on the same source commit](https://github.com/dylandrozario/the-gavel/actions/runs/39448247160) passed. These do not establish success for the eventual merged main commit. Task 0 remains incomplete pending owner review/merge, main-tree verification, and the main CI result. No schema work has started.

Task 0 continuation (2026-10-21): PR #6 is merged at `3c1a241`. The original merge CI was cancelled. A [fresh exact-main run](https://github.com/dylandrozario/the-gavel/actions/runs/39678683063) failed on its first attempt during Supabase initial-schema container startup (Docker exit 125), before project migrations. The failed job was retried once without source changes. Task 0 is still open until a successful exact-main result is recorded; no application/schema defect or permanent infrastructure fix is asserted from this single startup failure.

### Task 1: Resolve the content schema contract

**Deliverable:** A short written design grounded in the linked MVP requirements, plus an implementation-ready checklist with exact fields/types/functions/migration files. This is the decision task; dependent code tasks remain blocked until it is approved.

Execution status (2026-10-21): [Proposed contract](../specs/2026-10-21-content-foundation-design.md) prepared for owner review. Storage and behavior suggestions are explicitly unapproved. No new database table, dependency, RPC, or application mutation has been added.

- [ ] Resolve stored article-body representation and validation boundaries. An editor library remains a separate choice unless the stored format requires it; do not install one during planning.
- [ ] Resolve required versus optional draft fields, exact field limits, slug normalization/collision/edit rules, and taxonomy normalization. Distinguish draft validation from future publication requirements.
- [ ] Specify the role/grant matrix for taxonomy, private article data, associations, revisions, and audit records, including inactive and ineligible identities. Public reads must never expose private drafts/history.
- [ ] Specify ownership reassignment and referenced-record behavior without inventing archive-retention or Auth-identity deletion policy. Keep media-dependent fields out of executable migrations until their referenced schema/contract exists, and record their deferred status explicitly.
- [ ] Define revision/audit capture and mutation authority before permitting writes. Identify which operations remain denied in this data-only phase and how later workflow work will open them atomically.
- [ ] Update affected authoritative docs and obtain explicit approval for the written design. Record significant technical choices in an ADR if needed. Refine Tasks 2–6 with the resulting exact constraints and interfaces before implementation.

**Acceptance/review:** No unresolved schema-affecting choice is silently filled. The owner reviews behavior/security decisions. Client content labels can remain deferred because synthetic fixtures suffice.

### Task 2: Add taxonomy with its permissions

**Deliverable:** `sections`, `categories`, and `tags` with the Task 1-approved constraints, grants, and RLS.

- [ ] Write failing pgTAP assertions in `004_content_taxonomy.test.sql` for uniqueness, section references, normalization, and permitted/denied role operations.
- [ ] Run the focused SQL tests and confirm the expected missing-schema failures.
- [ ] Add the minimal additive migration and synthetic fixtures; include policies and grants immediately.
- [ ] Run focused tests, database lint, and existing foundation tests; regenerate types and update affected docs in the same commit.

**Acceptance/review:** Taxonomy invariants and the approved permission matrix hold through direct database access. No unconfirmed real categories or navigation choices are seeded.

### Task 3: Add owned draft article storage

**Deliverable:** The approved article columns and ownership/read boundary, with closed unimplemented lifecycle/write surfaces.

- [ ] Write failing assertions in `005_article_access.test.sql` using anonymous, inactive, Author A, Author B, administrator, and ineligible-identity fixtures.
- [ ] Prove cross-owner draft denial, owner spoofing denial, private-field protection, and rejection of unimplemented publication/status changes.
- [ ] Add the migration with one owner and one primary section, the approved content contract, explicit grants/RLS, and restrictive reference behavior.
- [ ] Run focused and existing SQL tests and database lint; regenerate types and update docs before committing.

**Acceptance/review:** Drafts are private to approved scopes; ownership cannot be forged. No UI, live publication, or media upload is implied by the table's existence.

### Task 4: Enforce article/category consistency

**Deliverable:** `article_categories` and its access/integrity boundary.

- [ ] Write failing assertions in `006_article_categories.test.sql` for cross-section insertion, duplicate links, unauthorized edits, article section changes, category section changes, and referenced-row deletion.
- [ ] Implement the Task 1-approved relational mechanism in an additive migration; do not rely solely on form filtering.
- [ ] Run focused/previous SQL tests, database lint, and type drift verification; document the invariant and commit.

**Acceptance/review:** No permitted operation can leave an article linked to a category from another section. Users cannot alter another owner's private associations.

### Task 5: Add tags and contributor credits

**Deliverable:** `article_tags` and `article_contributors` with the approved duplicate/order/role constraints and permissions.

- [ ] Write failing assertions in `007_article_tags_contributors.test.sql` for duplicate associations, invalid credit roles/order, reference integrity, and denied cross-owner mutations.
- [ ] Include a credited Author B on Author A's private draft and prove that credit grants neither private read nor edit authority. Include a contributor profile without a login.
- [ ] Add the minimal additive migration, synthetic fixture associations, and policies/grants.
- [ ] Run focused/previous SQL tests and lint; regenerate types and update docs before committing.

**Acceptance/review:** Credits remain presentation metadata, not ownership. Tags follow the approved normalization rule, and all associations preserve private article access boundaries.

### Task 6: Protect revision and audit storage

**Deliverable:** Minimal approved `article_revisions` and `audit_events` storage and privilege boundaries needed by later content writes.

- [ ] Write failing assertions in `008_content_history.test.sql` for unauthorized reads, client-written actor spoofing, revision/audit tampering, and retention/reference behavior from the accepted design.
- [ ] Implement only the approved history schema and grants. Keep client writes denied where atomic mutation/capture is not implemented in this phase.
- [ ] If the design includes an atomic capture function, prove an induced failure leaves neither a partial article change nor partial history; otherwise explicitly leave that function and all dependent write surfaces unimplemented.
- [ ] Run focused/previous SQL tests and lint; regenerate types and document exactly which history behavior is implemented before committing.

**Acceptance/review:** History cannot be forged, overwritten, or made public by ordinary requests. Adding storage is not presented as completed event capture. A later write-workflow plan must implement atomic capture before exposing mutations.

### Task 7: Verify the integrated schema and hand off

**Deliverable:** Evidence that the whole schema is compatible, secure, documented, and ready for a separate draft-editor/workflow plan.

- [ ] Test a clean local reset, then separately apply only the new migrations to a disposable database at the actual pre-phase schema with synthetic existing data. Assert old profile/membership rows and denials survive. Do not substitute reset for upgrade proof.
- [ ] Run `pnpm test:db`, `pnpm supabase db lint`, `pnpm db:types:check`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. These are planned checks; no Phase 2 result is claimed yet.
- [ ] Review the hosted CI result for the final commit, including unchanged foundation gates and the approved audit-exception scope.
- [ ] Update implemented/planned labels in README and authoritative docs; record unresolved decisions and remaining review/launch requirements. Commit only any resulting real changes.

**Acceptance/review:** Clean and upgrade proofs succeed, the full role matrix is tested, and documentation matches actual capabilities. Stop for owner review before starting the editor or publication phase.

## Review cadence and manual help

Work on one task at a time. Report what changed, commands actually run, gaps, and the commit/PR before continuing. A failed check or missing design decision stops dependent work rather than triggering a guessed fix.

The owner's input is needed for the proposed Phase 2 scope, Task 1's behavior decisions, and task review. Docker/local Supabase are already the intended development tools; a hosted project, real Google credentials, and Vercel setup are not prerequisites for this proposed phase. The second-human-review requirement stays recorded; it is not replaced by an assumed solo-maintainer exception.

This file is intentionally a proposed work-package plan. After scope/design approval, use the writing-plans workflow to fill the exact migration filenames, field limits, function contracts, and executable assertions from the accepted content design. Do not treat these blocked work packages as permission to invent those details.
