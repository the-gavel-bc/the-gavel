# Phase 2 Content Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement an approved execution plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the article and taxonomy data foundation, with tested ownership and database permissions, before building the editor.

**Architecture:** Extend the existing local Supabase schema and RLS boundary through additive migrations. Preserve server-side membership checks and database enforcement. Keep related implementation/tests together under the approved colocation convention once its integration reaches main.

**Tech Stack:** Existing Next.js/TypeScript application, Supabase PostgreSQL and CLI, pgTAP, generated database types, Vitest, and GitHub Actions. No new dependency or external service is approved by this plan.

**Spec:** [Accepted content contract](../specs/2026-10-21-content-foundation-design.md), [Approved MVP design](../specs/2026-10-16-the-gavel-mvp-design.md), [product requirements](../../product-requirements.md), [data model](../../data-model.md), [API contracts](../../api-contracts.md), and [security matrix](../../security-and-permissions.md#authorization-matrix).

**Status:** Tasks 0–6 complete as of 2026-10-21. The owner approved the content contract after reviewing the summary and excerpt/slug explanation. Taxonomy, private articles, category/tag/contributor associations, and protected history storage are implemented and verified; Task 7 integrated verification remains pending. The owner approved execution of this plan. Pause at the Task 6 review checkpoint before final integrated verification; unresolved later-phase/client decisions remain unresolved.

## Scope and outcome

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
- The accepted contract keeps all new application writes closed, including administrator writes. Atomic history capture and validated mutation interfaces are later work, not part of these table migrations.
- Seed only synthetic test data and confirmed content labels. Unresolved News categories, Features naming, navigation placement, retention, or footer decisions remain unresolved in the product requirements.
- Make one focused, reviewable commit per implementation task, including its tests and affected documentation. Pause after each task for the owner's review, as requested in the existing working agreement.

## Starting state and carry-forwards

- Integrated baseline: main `3c1a2412b0cb349d00300541f584b8c1b59a5dff`. [Hosted run 39678683063, attempt 2](https://github.com/dylandrozario/the-gavel/actions/runs/39678683063) passed all foundation gates on 2026-10-21. Attempt 1 failed during base-schema container startup (Docker exit 125), before project migrations. No source fix was applied and no permanent infrastructure remedy is claimed.
- PRs #3 and #5 supplied the documentation/task plan, and PR #6 integrated the colocation refactor. The new paths are present in the verified main tree.
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

### Task 0: Establish the integrated baseline — complete

- [x] Verify PR #6 merged into main; confirm the expected colocated component, library, browser-test, and script paths.
- [x] Confirm exact main commit `3c1a241` through GitHub and its successful hosted run 39678683063 attempt 2.
- [x] Record the baseline without claiming the outstanding independent human review is complete.

### Task 1: Resolve the content schema contract — complete

- [x] Record owner approval of JSON storage, incomplete draft rules, field bounds, slugs, closed writes, association constraints, and protected history.
- [x] Preserve unselected editor, live-content normalization, capture, media, retention, and infrastructure-deletion decisions as later work.
- [x] Record the significant storage/write-boundary choice in ADR 0006 and link the accepted contract from authoritative docs.
- [x] Refine the remaining work into exact files, helper signatures, focused assertions, commit boundaries, and verification below.

Task 1 completion means the design and concrete execution plan are ready. It does not claim schema implementation or approve future untrusted mutation/rendering interfaces.

## Execution details for Tasks 2–7

The accepted contract is authoritative for every column/type/default/bound/reference rule. The exact proposed migration filenames below are available in the current tree; check for collisions again at task start. Reuse existing pgTAP transaction/role patterns. A new test must fail for the intended missing-schema or missing-policy reason before its migration is written.

Before Task 2 changes the local schema, verify the fixed local project and save a private ignored JSON snapshot of the existing `profiles`/`memberships` rows and synthetic Auth identity fields to the plan's workspace. Confirm applied migration history ends at the three foundation migrations. This isolated synthetic local database is the upgrade test environment. Apply each new migration with `pnpm supabase migration up --local`; do not reset it until Task 7 first verifies preservation. SQL tests must roll back fixtures. Test fixture Auth eligibility changes stay transaction-local.

For every migration task, read the full test output, then run `pnpm test:db`, `pnpm supabase db lint`, regenerate formatted types through `pnpm --silent db:types > src/lib/supabase/database/database.types.ts`, and run `pnpm db:types:check`, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`. Expected: all commands exit 0 with no failed assertions or unexpected database warnings. Additive migration failure means investigate, not reset away the upgrade evidence. Commit the migration, assertions, generated types, and affected documentation together.

### Task 2: Add taxonomy with its permissions

**Files:** Create `supabase/migrations/20261021000000_content_taxonomy.sql` and `supabase/tests/004_content_taxonomy.test.sql`; update generated database types, `docs/data-model.md`, `docs/security-and-permissions.md`, and `docs/testing.md`.

**Interfaces:** Consumes existing `private.set_updated_at()` and `private.is_active_administrator(uuid default auth.uid()) -> boolean`. Produces `public.sections`, `public.categories`, `public.tags` with the accepted columns/constraints and SELECT-only application access. Creates no public RPC.

- [x] Write pgTAP tests: valid 120-character names/slugs; reject 121, empty, whitespace-only, leading/trailing whitespace, uppercase/noncanonical slugs, and negative navigation order. Duplicate slug/name fails globally for sections/tags and within a section for categories. Same category name/slug in different sections succeeds; missing section fails.
- [x] Add role tests with active/inactive sections and categories: anon/inactive/ineligible users see only active categories with active parents, and all tags; eligible active administrator sees inactive taxonomy too. Non-Google, unconfirmed, or out-of-domain administrator metadata must not expand reads. All new-table writes fail with SQLSTATE `42501` for anon and authenticated owner/other-author/admin roles.
- [x] Run `pnpm supabase test db supabase/tests/004_content_taxonomy.test.sql`; expect missing-table failure before the migration.
- [x] Implement the three tables with accepted UUID/timestamps/defaults and constraints. Use unique indexes on `lower(name)` in the accepted scope, plus slug uniqueness. References restrict parent deletion/update. Install updated-at triggers; enable RLS; revoke table privileges from PUBLIC/anon/authenticated, grant SELECT only. Use separate anon and authenticated policies so anon never invokes a private administrator predicate it cannot execute.
- [x] Apply with `pnpm supabase migration up --local`. Run the focused tests and shared migration checks above; update implemented labels and commit `feat: add secured content taxonomy`.

**Review outcome:** Catalog filtering and direct write denial are proven. Fixtures are transaction-local synthetic labels; no client content question is settled by a seed.

Task 2 evidence: 163 taxonomy assertions and all 209 database assertions passed; database lint, generated-type drift, strict types, lint, formatting, and unit/component checks passed. The populated local upgrade preserved all baseline identity rows. No editor, taxonomy mutation interface, or article storage was added. Independent human review remains outstanding under the existing Git workflow.

### Task 3: Add owned draft article storage

**Files:** Create `supabase/migrations/20261021010000_content_articles.sql` and `supabase/tests/005_article_access.test.sql`; update generated types and affected data/security/testing docs.

**Interfaces:** Consumes taxonomy and foundation profile/membership tables plus `private.has_eligible_identity() -> boolean` and administrator predicate. Produces `public.article_status` (`draft`, `published`, `archived`), `public.articles`, and `private.can_read_article(check_article_id uuid) -> boolean`.

- [x] Write tests for title 1/240 accepted and empty/241/whitespace rejected; excerpt NULL/600 accepted and empty/601 rejected; slug 180 accepted and 181/noncanonical/duplicate rejected; SEO keyphrase NULL/160 accepted and 161 rejected; meta description NULL/320 accepted and 321 rejected. Reject JSON arrays/scalars/JSON null while allowing SQL NULL and bounded objects. Build payloads using `octet_length(value::text)` to test 1,048,576 serialized bytes and rejection above that bound, including multibyte text.
- [x] Test owner/section references and exact timestamp/status combinations: draft has both timestamps NULL, published has publication only, archived has publication and archive. Missing required owner/section fails. Media fields remain absent.
- [x] Test eligible active Author A reads A's rows but not B's; B cannot read A's; administrator reads all. Anonymous, inactive, non-Google, unconfirmed, and out-of-domain identities cannot read articles, including synthetic published rows. All normal-role writes fail with `42501`. Owners with no credits retain read access. No client-supplied ID changes the authenticated identity.
- [x] Run focused SQL tests and observe intended missing-schema failure.
- [x] Implement the table and SELECT-only grants/RLS. Implement the stable fixed-search-path security-definer predicate: require trusted identity and active membership, then require either the article owner's profile `auth_user_id = auth.uid()` or the existing active administrator predicate. Return false for missing/unreadable IDs. Resolve identity privately without granting `profiles.auth_user_id` to clients; do not recurse through article RLS. Revoke PUBLIC/anon execution and grant authenticated execution. Give the article policy only this predicate; create no mutation policy/RPC.
- [x] Apply incrementally, run focused/shared checks, verify the upgrade snapshot is unchanged, update docs, and commit `feat: add private article storage`.

**Review outcome:** The accepted draft/read boundary is enforced by database constraints and RLS. No publication, reassignment, or editor is implemented.

Task 3 evidence: 168 article assertions and all 377 database assertions passed; database lint, generated-type drift, strict types, lint, formatting, and 44 unit/component tests passed. The incremental migration preserved the original foundation snapshot. All article application writes remain closed, and no public article projection, editor, media, lifecycle operation, or association/history storage was added. Independent human review remains outstanding.

### Task 4: Enforce article/category consistency

**Files:** Create `supabase/migrations/20261021020000_article_categories.sql` and `supabase/tests/006_article_categories.test.sql`; update generated types and affected docs.

**Interfaces:** Consumes `private.can_read_article(uuid)`, articles and categories. Produces `public.article_categories(article_id uuid, category_id uuid, section_id uuid)` with primary key `(article_id, category_id)`.

- [x] Write tests: valid same-section link succeeds for privileged fixture creation; mismatched section from either parent fails; duplicate link fails. Changing article section or category section while a link exists fails. Referenced article/category deletion fails. A separate privileged transaction can remove a link, change the section, and add only a matching link; demonstrate rollback leaves consistent data on failure.
- [x] Test association reads follow article access for owner/admin and deny others, including a credited-looking identity. All app-role writes fail with `42501`.
- [x] Run focused SQL tests; observe intended missing-table failure.
- [x] Add parent unique constraints `(id, section_id)` and the two restrictive composite foreign keys. Add reverse-reference indexes where the composite primary key does not cover the lookup. Enable RLS and SELECT-only authenticated grants using the existing article predicate; grant anon no access.
- [x] Apply incrementally, run focused/shared checks, update docs, and commit `feat: enforce article category integrity`.

**Review outcome:** Every tested parent/child mutation path preserves the same-section invariant without relying on UI filtering.

Task 4 evidence: 59 association assertions and all 436 database assertions passed; database lint, generated-type drift, strict types, lint, formatting, and 44 unit/component tests passed. Both parent mutation directions, valid replacements, and failed-operation rollback are proven in privileged test subtransactions. The original foundation snapshot remains unchanged. No application association mutation, UI, tags/credits, or history workflow was added. Independent human review remains outstanding.

### Task 5: Add tags and contributor credits

**Files:** Create `supabase/migrations/20261021030000_article_tags_contributors.sql` and `supabase/tests/007_article_tags_contributors.test.sql`; update generated types and affected docs.

**Interfaces:** Consumes article predicate, profiles, and tags. Produces `public.article_tags(article_id uuid, tag_id uuid)` and `public.article_contributors(article_id uuid, profile_id uuid, contribution_role public.contribution_role, display_order integer default 0)`; role enum is `writer | editor | creative`.

- [x] Write tests: association duplicates/missing references fail; credit order 0 succeeds and -1 fails; unsupported role fails. A profile can hold writer and editor on one article but cannot repeat writer. Order ties succeed. A contributor without an Auth link can receive a credit.
- [x] Credit eligible Author B on Author A's private article and prove B still cannot read it or its private associations. Owner access does not depend on a credit. Administrator reads all associations. Anonymous/inactive/ineligible identities are denied. All app writes fail with `42501`.
- [x] Run focused tests; observe intended missing-schema failure.
- [x] Implement accepted primary keys, enum, bounds, restrictive references, reverse-reference indexes, SELECT-only authenticated grants, and RLS using the existing article predicate. Do not introduce tag-entry Unicode normalization or an author create-tag operation.
- [x] Apply incrementally, run focused/shared checks, update docs, and commit `feat: add secured article tags and credits`.

**Review outcome:** Credits remain metadata and cannot become a second ownership channel.

Task 5 evidence: 90 tag/credit assertions and all 526 database assertions passed; database lint, generated-type drift, strict types, lint, formatting, and 44 unit/component tests passed. Actual writer/editor credits give Author B no access to A's article or private associations; owner A reads without a credit. The original foundation snapshot remains unchanged. No application mutation, renderer, tag normalization, or history workflow was added. Independent human review remains outstanding.

### Task 6: Protect revision and audit storage

**Files:** Create `supabase/migrations/20261021040000_content_history.sql` and `supabase/tests/008_content_history.test.sql`; update generated types and affected docs.

**Interfaces:** Consumes article/administrator predicates and Auth identities. Produces `public.article_revisions` and `public.audit_events` with the exact accepted contract columns, snapshot version/bounds, action allowlist, and restrictive references. Creates no write or capture function.

- [x] Write tests: revision snapshot must be an object, version exactly 1, serialized size <= 2,097,152 bytes, with invalid version/shape/oversize rejected. Actor and article references must exist; referenced identity/article deletion fails.
- [x] Test all seven accepted article audit actions and reject other action/resource types. Audit storage has no body, arbitrary metadata, or snapshot column. Resource ID is not an article FK; a privileged fixture audit event can retain an ID without a current article row. Correlation ID accepts NULL or a UUID.
- [x] Test owners read only own revisions; administrator reads all revisions and audit rows. Other authors, including credited contributors, cannot read those revisions; ordinary owners cannot read audit rows. Inactive/ineligible identities fail. Every app-role insert/update/delete on both tables fails with `42501`, including forged actor writes.
- [x] Run focused tests; observe intended missing-table failure.
- [x] Implement accepted schema, indexes on revision article IDs and audit resource IDs, RLS, and authenticated SELECT-only grants through the existing predicates. Do not add capture/restore/deletion endpoints or claim automatic events exist.
- [x] Apply incrementally, run focused/shared checks, update docs, and commit `feat: add protected content history storage`.

**Review outcome:** Stored history is private and cannot be forged by normal requests. Atomic capture remains closed future work, not an unfinished callable API.

Task 6 evidence: 122 history assertions and all 648 database assertions passed; database lint, generated-type drift, strict types, lint, formatting, and 44 unit/component tests passed. Crossed actors and credits cannot grant revision access; audits remain administrator-only and all application tampering is denied. The original foundation snapshot remains unchanged. Automatic capture/restore/deletion APIs remain future work. Independent human review remains outstanding.

### Task 7: Verify the integrated schema and hand off

**Files:** Update README, data/security/API/testing docs and this plan only where real implementation/evidence changes; preserve existing source/tests. Store private local upgrade evidence in the ignored plan workspace, not Git.

**Interfaces:** Consumes all five new migrations, all SQL assertion suites, generated types, and the pre-Task-2 foundation snapshot. Produces an evidence-backed phase handoff; no new application endpoint.

- [ ] Before any reset, confirm all five migrations applied incrementally to the populated pre-phase local schema. Compare the existing foundation snapshot and run the whole SQL denial suite. Record this as upgrade proof; if the original baseline/snapshot is unavailable, reproduce a separate controlled pre-phase environment rather than claiming upgrade coverage from a reset.
- [ ] Then run `pnpm supabase db reset` for separate clean-install proof and run all SQL tests again. Verify the new-table empty seed state is expected; synthetic content fixtures belong inside tests.
- [ ] Run database lint/type drift, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. Expected: exit 0 throughout; report actual assertion counts and failures. Browser fixtures may mutate only the fixed local synthetic identities after upgrade preservation is already checked.
- [ ] Review hosted CI on the final branch commit. Keep the exact approved dependency exception and unfiltered production scan; do not add ignores to make unrelated findings pass.
- [ ] Update implemented/planned labels, record the new migration/read boundaries and remaining editor/media/publication/capture/manual-launch work, and commit `docs: record content foundation verification` if those changes exist.

**Review outcome:** Clean and upgrade paths preserve foundation access, all new-table denials pass, and docs describe the actual data-only capability. Pause for owner review before the next product slice. Independent human review and pre-launch session coverage remain separately tracked.

## Review cadence and change costs

Work one task at a time and notify the owner after its verified commit. Preserve the agreed owner-review checkpoints. Execute test steps against observed results, not expectations, and record failed attempts and fixes honestly. No second-human approval or future content decision is invented by a green CI run.

Prefer focused changes over speculative abstractions. Increasing a bound is generally additive; reducing one needs an existing-data check. Stored-body format, lifecycle, relationships, permissions, and published slug changes need deliberate compatibility/migration tests. Keep migrations forward-only in normal use: never edit applied history or drop populated tables as an automatic rollback.
