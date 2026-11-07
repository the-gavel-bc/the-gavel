# Phase 4 Editorial Workflow Implementation Plan

> **For agentic workers:** Once the owner accepts this plan, use `superpowers:executing-plans` and the repository's task-by-task review workflow. Before each task, write its focused subplan and acceptance checks; implement only that task, make small Conventional Commits, verify it, and stop at the owner checkpoint before starting the next task.

**Goal:** Complete the approved editorial workflow from private drafts through publication and administration, with database-enforced permissions, auditable changes, and accessible dashboard controls.

**Architecture:** Keep the current user-scoped server boundary and closed direct-table writes. Add only narrow authenticated operations with fixed search paths, trusted actor derivation, server validation, RLS/database enforcement, and atomic revision/audit capture. Do not add a service-role application client.

**Tech Stack:** Existing Node 22, pnpm 11.25.0, Next.js/React/TypeScript, Zod, Supabase Auth/Postgres/Storage, pgTAP, Vitest, and Playwright. No new service or dependency is assumed.

**Spec:** Existing approved [product requirements](../../product-requirements.md), [API contracts](../../api-contracts.md), [data model](../../data-model.md), [security controls](../../security-and-permissions.md), [design system](../../design-system.md), [testing guidance](../../testing.md), and the [Phase 3 private-draft contract](../specs/2026-10-22-private-draft-workflow-design.md) remain authoritative. The [accepted Task 1 design](../specs/2026-11-01-editorial-workflow-design.md) records Phase 4 operation contracts and decision gates without claiming implementation.

**Plan baseline:** Based on `origin/main` at `1285933cb40ce30e62023fc94fbc739cac20e5f5`, after Task 11 / PR #26 merged. Planning branch: `docs/phase-four-editorial-controls`. Dedicated execution branch: `feat/phase-four-editorial-workflow`, created from the completed plan at `e3eb6f0` in the existing isolated linked worktree `/private/tmp/the-gavel-task11`.

**Selected order:** Lifecycle first. Complete the lifecycle contract, provide the minimum secure image path required for publication readiness, then extend the constrained editor for article media before owner editing/publishing/archive and administrator restore before the remaining admin controls.

**Scope boundary:** This phase covers editorial dashboard and storage workflows. Public article pages, public search/archives, and public image rendering remain Phase 5. Scheduled publishing, comments, newsletter, legacy import, and public letter submission remain outside MVP. The secure media and editor slices are included because approved MVP requirements include article imagery, captions, and approved video; it does not include public reader routes.

## Global constraints

- Authors act only on articles they own. Credits do not grant access or mutation authority. Administrators may manage all articles and memberships. Test positive and denied paths at the database operation and server/UI boundaries.
- Keep direct article/content writes closed for application roles, including administrators. The foundation currently permits administrator membership writes under RLS; the membership task must explicitly replace that interim path with audited checked operations before exposing management UI. Derive actor, owner, and role from trusted state.
- Preserve optimistic version checks, retry safety, snapshots, and atomic revision/audit capture. A repeated or uncertain request must not create duplicate transitions or history.
- Publish/archive/restore must not expose draft or archived content through anonymous APIs. Public projections and routes are outside this phase.
- Do not edit applied migrations. Use forward-only migrations, keep schema changes additive where possible, review permission tightening explicitly, test upgrade from the prior schema and clean installation, regenerate database types, and preserve existing rows.
- Use the existing upload controls: JPEG, PNG, and WebP only; verify actual content, bound bytes and decoded dimensions, generate storage names, and remove unneeded metadata where practical. Media may be removed only after proving no retained article references it.
- Use allowlisted audit actions/resources and safe metadata only. Never record article bodies, credentials, private profile links, or arbitrary request payloads.
- Do not invent taxonomy labels, site copy, retention rules, policies, or client answers for documented TODOs. Keep gated functionality unavailable until its governing decision is recorded.
- Keep task commits cohesive and reviewable, targeting at most 300 changed lines per commit. Include related schema, tests, types, and docs with the behavior. Auth, authorization, RLS, migrations, uploads, and rich content require maintainer review; agent review and CI do not replace it.

## Review focus

1. Direct RPC calls, forged form fields, stale tabs, credited non-owners, inactive memberships, and administrators without active eligibility cannot bypass role, ownership, status, or version checks.
2. Each state change captures the correct snapshot and one trusted-actor audit event atomically; failed operations leave content, links, media references, and history consistent.
3. Publication readiness uses approved content/image requirements and safe upload verification; no untrusted file is served as executable content.
4. Membership, contributor, taxonomy, curation, and settings changes are narrowly authorized and audited without broad audit payloads or secret exposure.
5. Existing draft create/save behavior, privacy denials, responsive/accessibility behavior, schema upgrade compatibility, and exact-head hosted CI remain green.

## Task 0 — establish the integrated baseline: complete

- [x] Phase 3 Task 11 / PR #26 merged into `main` at `1285933`; its `foundation` check passed on the PR head ([run 40798201017](https://github.com/dylandrozario/the-gavel/actions/runs/40798201017)). The Phase 4 plan branch starts from that commit. No Phase 4 implementation or hosted check is claimed.
- [x] Confirm the isolated Phase 4 planning branch starts from the merged Phase 3 head and contains only the plan commits; no Phase 4 product task is complete.

## Shared execution rules

- At the start of each implementation task, confirm `origin/main`, the Phase 4 branch head, a clean task branch based on that head, the last applied migration, available filenames, and preserved local data. Save a private baseline before the first Phase 4 migration; never reset the existing project to make a test pass.
- Write a focused failing assertion for the missing behavior or denial before implementation. Run it and record the expected failure; implement the narrow change; rerun it to pass. Keep synthetic fixtures transaction-local. A documentation-only task uses link/consistency checks instead.
- For database tasks, apply additive migrations against the preserved local schema, run focused pgTAP and full `pnpm test:db`, `pnpm supabase db lint`, regenerate types, and run `pnpm db:types:check`. For application tasks, run focused unit/browser checks, then the documented type, lint, format, build, and affected regression gates. Do not run concurrent SQL suites against the same project.
- Split each task into reviewable commits of at most about 300 changed lines. A commit carries its own behavior, focused tests, generated types when applicable, and affected docs. Record exact commands/results, screenshots for changed dashboard flows, review findings, rollback notes, and an owner checkpoint before the next task. Open each task PR against `feat/phase-four-editorial-workflow` after the task is reviewable. Merge accepted task PRs into that branch in order; after Task 16 local verification, open the Phase 4 PR against current `main` and record its hosted CI in Task 16. Do not claim CI until the relevant PR head passes.

The Task 1 contract fixes operation shapes and invariants. Before each of Tasks 2–16, its focused subplan must reserve exact migration/test filenames and callable signatures against the live tree, as the Phase 2 and Phase 3 plans did. Do not reserve a migration timestamp or introduce a public grant before checking the live tree at the owning task.

## Task 1 — accept the editorial workflow contract: complete

**Files:** Refine `docs/superpowers/specs/2026-11-01-editorial-workflow-design.md`; record a decision in `docs/decisions/` only if implementation selects a consequential technical approach not already fixed by approved docs. Update API/data/security docs only to clarify accepted contracts, not to claim implementation.

- [x] Define owner/admin permissions and state transitions: draft to published, published to archived, administrator restore, published editing that preserves `published_at`, and archived read-only until restore.
- [x] Specify publication readiness, including required image/alt text and metadata, using existing MVP requirements. Record generated, noneditable slugs that follow titles/display names until first publication and freeze afterward.
- [x] Specify concurrency, retry/idempotency, safe failures, snapshots, audit action names, timestamps, and transaction boundaries for article operations.
- [x] Specify bounded JPEG/PNG/WebP upload intake, dimension checks, byte verification and re-encoding obligations.
- [x] Define last-administrator behavior and the narrow audit event shape. Assign exact file/signature reservations, RED/GREEN cases and rollback review to each focused subplan before implementation.
- [x] Keep permanent deletion blocked until the owner/client confirms retention and its focused plan reconciles restrictive revision references, preserved audit records, Auth references, and orphan-media cleanup.
- [x] Keep unresolved News categories, `Outside of BC` naming, site copy/URLs, tag normalization, and BC policy questions unresolved; list which later task each decision gates.

**Acceptance:** The owner reviewed the concrete lifecycle/upload/admin proposal and directed work to continue on 2026-11-01. The linked contract keeps remaining client decisions gated. No Phase 4 code or migration is claimed by this task.

**Validation:** Check document links and consistency against the current product/API/data/security docs; `git diff --check`. No application tests apply to this documentation-only task.

## Task 2 — generate slugs from editorial names

**Files:** Update the current draft form/metadata fields, draft action contract, server actions, canonical validation, and checked create/save migration through new forward files; add focused SQL/unit/browser tests and API/data/security/testing docs. Later profile tasks consume the same accepted normalization rule.

**Interfaces:** Create and save commands accept title and article fields, with no editable slug. The authoritative database operation derives a canonical unique draft slug from title, updates it when a draft title changes, and preserves the stored slug after publication. Contributor profile operations later derive prepublication slugs from display name.

**Test-first and commit boundary:** RED: the existing editable slug field, forged direct-RPC slug, concurrent same-title collision, Unicode/empty normalization, exact replay, and published-slug change. GREEN: focused validator/RPC/form tests and desktop/mobile draft journeys; commit normalization/atomic collision behavior before removing the UI field.

- [x] Define and prove the accepted normalizer, fallback, suffix allocation, bounds, and migration compatibility. Preserve existing rows; do not rewrite existing published paths.
- [x] Remove manual article slug editing from create/edit forms and direct client command schemas. Keep titles editable; draft slugs follow title changes and published slugs stay fixed.
- [x] Ensure database authority, including direct RPC calls, cannot accept a caller-selected slug. Preserve safe conflict/retry behavior and existing owner/admin denials.

Task 2 evidence and the required migration write-pause procedure are recorded in the [focused plan](2026-11-02-generated-editorial-slugs.md) and [testing notes](../../testing.md#phase-4-task-2-generated-article-draft-slugs). Hosted CI is pending on its task PR; profile slug controls remain assigned to later tasks.

**Acceptance:** Authors edit titles without seeing a slug control; generated slugs are unique and stable under retries/concurrency, follow draft title changes, and freeze at publication. No existing published URL changes.

**Validation:** Focused SQL/contract/form/browser tests, then full affected database, unit, type, lint, format and build gates.

## Task 3 — secure article image upload and attachment

**Files:** Add the `media_assets` and storage policy migration, focused pgTAP coverage, a colocated upload contract/action/query/component and tests under `src/lib/media/` and `src/components/dashboard/article-media/`; update generated types and API/data/security/testing docs.

**Interfaces:** Proposed `requestArticleImageUpload`, `finalizeArticleImageUpload`, and article-image reference operations use opaque IDs and typed results; Task 1 fixes their exact signatures, limits, and retry behavior. Storage and database guards independently authorize each operation.

**Test-first and commit boundary:** RED: direct upload/finalize/attach denials, MIME-byte mismatch, dimensions, orphan cleanup, and retained-reference protection. GREEN: the same focused checks plus editor upload states; commit storage schema/policies, operations, and UI in independently reviewable increments.

- [ ] Implement a private upload and finalization flow for approved raster formats. Verify bytes and decoded dimensions server-side; use generated object keys, size limits from Task 1, and the existing user-scoped boundary.
- [ ] Enforce owner-only article attachment and administrator override at Storage and database boundaries. A credited non-owner and an inactive member cannot upload or attach media to another article.
- [ ] Store only the approved media metadata and article reference. Require accessible alt text at the point required by the accepted publication contract; keep captions as article content metadata if the contract calls for them.
- [ ] Ensure failed finalization cannot leave a trusted article reference to an invalid object. Add safe cleanup for unreferenced failed uploads; never remove an asset while any retained article references it.
- [ ] Add keyboard-accessible upload, progress, retry, error, and removal states. No public image rendering or arbitrary file support.

**Acceptance:** Valid synthetic JPEG/PNG/WebP uploads can be safely attached by an authorized owner/admin; malformed, oversized, misdeclared, dimension-overflow, cross-owner, inactive, and non-image uploads fail without exposing private objects or corrupting references.

**Validation:** Focused upload/Storage pgTAP and component tests, full `pnpm test:db`, `pnpm db:types:check`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build`.

## Task 4 — rich article media and approved video

**Files:** Extend the canonical body validator and editor adapter under `src/lib/articles/draft-contract/` and `draft-document/`; add image/caption/video controls under `src/components/dashboard/draft-editor/`; add focused SQL, parity, unit, browser and documentation updates. Use Task 3's finalized media references.

**Interfaces:** A versioned canonical image node references a finalized asset ID with bounded alt/caption fields. A video node is enabled only for owner-approved providers and normalized safe URLs; no raw iframe/HTML input enters storage. Task 1 fixes exact grammar and migration names.

**Test-first and commit boundary:** RED: unsupported/foreign media references, malformed image/video nodes, hostile URLs, legacy document round trips, and cross-owner writes. GREEN: matching SQL/TypeScript/editor parity plus keyboard/mobile journeys; commit grammar, adapter, and controls as separate reviewable increments.

- [ ] Preserve all Phase 3 stored bodies and revision snapshots unchanged; supported old documents remain editable and unknown legacy content remains safely read-only.
- [ ] Recheck finalized asset ownership and article authority on each save. Images require alt text and bounded captions; arbitrary external image URLs, SVG, HTML and executable embeds are rejected.
- [ ] Gate video controls until the client approves exact providers. Render approved embeds through a fixed safe component rather than pasted HTML.

**Acceptance:** Owners/admins can use safe image/caption content; unauthorized or malformed references fail without dropping existing content. Video remains visibly gated until a provider allowlist is accepted.

**Validation:** Focused SQL/contract/editor tests, DB/TypeScript parity, desktop/mobile browser cases, then full affected database, unit, type, lint, format and build gates.

## Task 5 — edit published articles safely

**Files:** Extend the versioned article-save contract and its migration/pgTAP tests; update the existing draft editor query/action/form only in owned modules; add published-edit browser cases and update API/security/testing docs.

**Interfaces:** A versioned `SaveArticleCommand` extends the current draft contract only for accepted statuses; the existing editor receives a status-aware editable result. Task 1 settles archived-edit behavior and published slug policy before signatures are final.

**Test-first and commit boundary:** RED: owner/admin success, cross-owner/credited/inactive denial, stale version, unsupported body, and preserved `published_at`/status. GREEN: focused SQL/action/editor tests and desktop/mobile save/reopen; commit database boundary before UI integration.

- [ ] Extend version-checked save for published articles without accepting status, owner, publication timestamps, audit actor, or other protected fields from the client.
- [ ] Permit owners to edit only owned articles and administrators to edit any article, per Task 1's accepted archived-edit rule. Credits confer no authority.
- [ ] Preserve status and publication timestamp on an ordinary edit; recheck publication readiness after locks for a changed published edit; atomically save allowed content/associations, revision, and `article.updated` audit entry.
- [ ] Keep lifecycle controls separate from content save. Reject stale versions and unsupported stored body formats without overwriting newer data or dropping unknown content.
- [ ] Do not change published slugs in this task. Archived edit behavior follows the explicit Task 1 decision; no hidden restore or publish transition.

**Acceptance:** Owner/admin edits persist with correct version/history and status; unauthorized, stale, malformed, unsupported, and protected-field requests are rejected with input retained. Existing draft journeys remain unchanged.

**Validation:** Focused SQL/unit tests and desktop/mobile edit-save-reopen journeys, then the Phase 3 unit, database, type, lint, format, and build gates.

## Task 6 — owner publish and archive workflow

**Files:** Add the narrow lifecycle migration/pgTAP tests, typed article lifecycle operation/action modules, owner dashboard status controls, and corresponding API/data/security/testing docs.

**Interfaces:** A lifecycle command carries `requestId`, `articleId`, and `expectedVersion`; separate publish/archive operations return a stable status/version result. The database derives actor, owner, timestamps, and audit identity.

**Test-first and commit boundary:** RED: readiness, direct-RPC role/status/version denials, exact replay, competing publish/archive, and atomic history. GREEN: focused SQL/concurrency tests, then action/UI journeys; commit transition operations before controls.

- [ ] Implement publish-now and archive transitions through explicit authorized operations. Require an eligible active owner/admin, valid current version, and all Task 1 publication-readiness conditions.
- [ ] Capture transition, revision, and audit atomically. Exact retries must not duplicate publication/archive audit or history. Archiving preserves publication history needed for restoration.
- [ ] Expose publish/archive controls only where the accepted status allows them; confirmation and pending/error/success states are accessible. No schedule controls.
- [ ] Preserve all Phase 3 create/save receipt and quota behavior. Do not provide a client path to set arbitrary lifecycle timestamps or status.

**Acceptance:** Owners can publish and archive only their own eligible, ready articles; administrators can perform the accepted transitions on any article; credited non-owners and ineligible users cannot. Invalid readiness and stale versions fail safely. No anonymous article read becomes possible in Phase 4.

**Validation:** Direct SQL/RPC denial and concurrency/idempotency tests, focused browser flows, then full database, app, accessibility, type, lint, format, and build checks.

## Task 7 — administrator article management and restore

**Files:** Add the admin article/archive routes and colocated query/action/table/detail modules under `src/app/(dashboard)/dashboard/admin/articles/` and `src/components/dashboard/admin-articles/`; add restore operation tests and update component/API/security/testing docs.

**Interfaces:** Admin list/detail queries take bounded cursor/filter inputs; restore takes the accepted lifecycle command and returns a versioned result. My Articles remains owner-filtered.

**Test-first and commit boundary:** RED: forged cursor/UUID/role, ordinary-author/inactive/anon denial, wrong-status restore, replay, and pagination bounds. GREEN: SQL/query/action tests and desktop/mobile admin journeys; commit restore boundary before list/detail UI.

- [ ] Provide bounded, paginated lists for all articles and archived articles with explicit status, owner, and safe search/filter fields. Do not fetch or render body content in list rows.
- [ ] Provide administrator-only detail and restore actions. Restore only a publication-ready archived article to the accepted target state without losing its original publication timestamp or history; use expected-version checks.
- [ ] Guard routes, queries, actions, and database operations independently. An author cannot reach admin data by changing a URL, cursor, UUID, or submitted role.
- [ ] Add loading, empty, error, not-found, and permission-denied states; include mobile table alternatives and keyboard-operable controls.

**Acceptance:** Active administrators can manage every article and restore archived articles as contracted; ordinary authors remain owner-scoped; anonymous and inactive users receive no private data. Restore creates one revision/audit event and is retry-safe.

**Validation:** Role/ownership denial tests at all boundaries, paginated query tests, desktop/mobile Playwright coverage, and focused/full documented gates.

## Task 8 — administrator audit history

**Files:** Add paginated audit query/action/UI under `src/app/(dashboard)/dashboard/admin/audit/` and `src/components/dashboard/admin-audit/`; extend only the API/component/security/testing docs needed for implemented article events.

**Interfaces:** `listAuditEvents` accepts an allowlisted bounded cursor/filter and returns safe summaries; article event labels are presentation-only mappings, not permission rules.

**Test-first and commit boundary:** RED: non-admin direct read, malicious cursor/filter, unbounded page, and body/identity leakage. GREEN: focused RLS/query/render tests and keyboard/mobile pagination; commit query boundary before page UI.

- [x] Read only the current caller's authorized, paginated audit history. Display safe actor label, action, resource, and timestamp; do not expose raw metadata, article body, identity links, or SQL diagnostics.
- [x] Add stable human-readable labels for implemented article create/update/publish/archive/restore events. Filters are bounded and allowlisted.
- [x] Keep audit rows available after article archival and maintain existing actor-reference behavior.
- [x] Do not add non-article audit actions here; each later admin mutation task adds its own narrowly reviewed action/resource constraints and display label.

Task 8 implementation and local proof: [PR #36](https://github.com/dylandrozario/the-gavel/pull/36). Hosted CI and human review remain pending.

**Acceptance:** Active administrators can browse recent article activity; owners, credited contributors, inactive members, and anonymous users cannot read the audit stream. Pagination/filter inputs cannot expand authority or cause unbounded reads.

**Validation:** Database grant/RLS and query denial tests, safe rendering and pagination unit tests, accessible desktop/mobile browser checks, and focused/full documented gates.

## Task 9 — administrator membership management

**Files:** Add narrowly scoped membership operation migration/pgTAP tests, typed admin queries/actions, and routes/components under `src/app/(dashboard)/dashboard/admin/members/`; extend the audit allowlist for only approved membership actions and update API/data/security/testing docs.

**Interfaces:** Membership list and approve/change/deactivate commands use target user IDs and strict allowlisted role/action values; actor and audit resource are server/database derived.

**Test-first and commit boundary:** RED: author/inactive/anon/forged actor denial, last-admin race, self-lockout, replay, and approval timestamp invariants. GREEN: SQL concurrency/action tests then admin UI; commit each audited operation with its schema and docs.

- [x] List members with bounded pagination and only safe identity fields. Never expose another profile's private Auth linkage.
- [x] Allow eligible administrators to approve, change the accepted role, or deactivate a membership. Derive the actor from trusted identity and preserve approval/revocation timestamps.
- [x] Enforce the Task 1 self-lockout and last-active-administrator rule in the database transaction as well as the UI.
- [x] Add the audited mutation operations before revoking the foundation's direct `authenticated` membership INSERT/UPDATE/DELETE grants and admin mutation policies in a reviewed forward migration. Audit each successful membership change atomically; reject forged role/actor fields and duplicate/replayed effects.
- [x] Do not create/delete Auth identities, alter Google eligibility rules, or grant source/hosting permissions.

**Acceptance:** Only an active administrator can change memberships; every denial preserves prior state; successful changes leave the target's expected access and one audit event. The last administrator cannot be accidentally removed under the accepted rule.

**Validation:** SQL tests for administrator, author, inactive, anonymous, self-change, last-admin, and replay cases; route/action checks; focused/full documented gates.

## Task 10 — administrator contributor-profile management

**Files:** Add profile operation migration/tests and admin contributor routes/components under `src/app/(dashboard)/dashboard/admin/contributors/`; update API/data/security/component/testing docs and the audit allowlist for profile actions.

**Interfaces:** Contributor commands address a profile ID and bounded public fields only; `auth_user_id` is never an editable field. Admin-only queries provide safe paginated profile summaries.

**Test-first and commit boundary:** RED: Auth-link and role injection, referenced-profile destruction, duplicate slug, cross-role denial, and credit preservation. GREEN: profile operation/query tests and admin browser flow; commit profile boundary before UI.

- [x] Support create/edit/deactivate of public contributor profiles, including non-login guest writers. Do not allow operations to modify `auth_user_id`, membership, or Auth identity.
- [x] Prevent destructive removal of profiles referenced by articles/credits; block deactivation while published or archived articles reference the profile.
- [x] Validate display names, biographies, generated slugs, and active state; derive the slug from the display name until the profile owns or is credited on a published article, then freeze it. Never expose a slug edit control or accept a caller-selected slug; no existing public link is silently invalidated.
- [x] Audit profile changes using a bounded event contract without recording biography text or private identity data.

**Acceptance:** Administrators can manage guest and member contributor profiles without granting article authority; non-admins cannot enumerate or mutate the admin catalog. Existing article credits remain referentially valid.

**Validation:** SQL relationship/denial tests, safe text/slug tests, accessible admin browser flows, and focused/full documented gates.

## Task 11 — administrator taxonomy management

**Files:** Add taxonomy operation migrations/tests and admin routes/components under `src/app/(dashboard)/dashboard/admin/taxonomy/`; update API/data/security/component/testing docs and the audit allowlist for approved taxonomy actions.

**Interfaces:** Separate section/category/tag commands preserve existing relationship rules; tag create/rename signatures wait for the accepted normalization contract. No tag `active` field is assumed.

**Test-first and commit boundary:** RED: wrong-section links, referenced rename/deletion, inactive parent effects, duplicate tags, and direct non-admin writes. GREEN: focused SQL/selector regressions plus admin UI; commit each catalog operation separately.

- [ ] Manage existing sections and categories through narrow operations with valid parent relationships and their existing active states; manage tags under their current no-active-state model.
- [ ] Block deactivation of sections/categories referenced by published or archived articles; do not cascade-delete links or make existing drafts silently invalid. Existing Phase 3 save validation remains authoritative.
- [ ] Do not seed or publish unresolved News categories or rename `Outside of BC` without owner/client confirmation.
- [ ] Tag creation/renaming stays gated until the documented Unicode/punctuation normalization contract is approved. No arbitrary label or slug normalization is invented in this task.
- [ ] Audit changes without storing unrestricted before/after payloads.

**Acceptance:** Approved existing taxonomy can be managed without invalidating article relationships; pending client labels remain absent; unsupported tag normalization cannot create ambiguous duplicates.

**Validation:** SQL tests for relationship integrity, inactive taxonomy, stale draft selections, authorization and audit; admin keyboard/mobile flows; focused/full documented gates.

## Task 12 — author public-profile editing

**Files:** Add a user-scoped profile mutation contract/action/form under `src/lib/profiles/` and `src/components/dashboard/profile/`, route `/dashboard/profile`, tests, and API/security/component/testing docs.

**Interfaces:** `updateOwnPublicProfile` accepts only public fields and derives the caller profile; any image reference uses Task 3’s accepted asset ownership rule.

**Test-first and commit boundary:** RED: cross-profile, inactive, Auth-link/role injection, unsafe biography, and foreign image reference. GREEN: operation/action/form tests and mobile keyboard flow; commit mutation boundary before profile UI.

- [ ] Let each active member edit only their own approved public biography and display fields. Read and validate public profile data without exposing Auth linkage.
- [ ] Derive the public-profile slug from the display name while no published article owns or credits the profile; freeze it afterward. Do not accept a caller-selected slug, including through direct database calls.
- [ ] Reuse Task 3 for an optional profile image only if its accepted media contract supports this reference safely; otherwise keep image selection disabled until a separate approved slice.
- [ ] Keep public profile routes/rendering for Phase 5. Do not let profile edits change membership, role, or article ownership.

**Acceptance:** A user can edit only their own safe public profile; administrators do not gain arbitrary identity-link changes; non-members and cross-profile requests are denied.

**Validation:** Owner/role denial tests, text safety and image reference tests if enabled, accessible browser flow, and focused/full documented gates.

## Task 13 — administrator homepage curation

**Files:** Add `homepage_selections` migration/tests, admin query/action/form under `src/app/(dashboard)/dashboard/admin/homepage/`, and update API/data/security/component/testing docs.

**Interfaces:** `saveHomepageSelections` accepts bounded ordered article IDs for lead, Featured News, and Read This; a read result supplies selections and deterministic fallback candidates.

**Test-first and commit boundary:** RED: draft/archived/duplicate/unknown selections, forged order, non-admin call, and post-selection archive. GREEN: SQL/order/fallback tests and curation UI; commit storage/eligibility before controls.

- [ ] Manage the lead story, ordered Featured News, and Read This selections using only published, non-archived articles.
- [ ] Validate uniqueness/order/limits and preserve safe recent-content fallbacks when selections are absent or become ineligible.
- [ ] Audit selection changes with bounded metadata; never accept arbitrary article body or public rendering fields.
- [ ] Keep public homepage rendering in Phase 5; this task only provides controlled curation and verification of saved selections.

**Acceptance:** Only administrators can set valid selections; draft/archived/unknown article IDs are rejected at the database boundary. Missing selections still have deterministic fallback data for Phase 5.

**Validation:** SQL eligibility/role tests, ordering/fallback unit tests, accessible admin browser checks, and focused/full documented gates.

## Task 14 — administrator site information

**Files:** Add an allowlisted `site_settings` model/migration/tests, admin query/action/form under `src/app/(dashboard)/dashboard/admin/site/`, and update API/data/security/component/testing docs.

**Interfaces:** Site information reads/writes use named allowlisted fields and typed validators; the operation never accepts arbitrary setting names or raw HTML.

**Test-first and commit boundary:** RED: unknown key, unsafe URL, oversized text, non-admin call, and arbitrary audit payload. GREEN: SQL/action/form tests and responsive admin flow; commit allowlist boundary before UI.

- [ ] Implement only the approved settings keys and field types: mission text, contact email, social URLs, and submission instructions as confirmed by Task 1.
- [ ] Use strict per-field validation and safe URL protocols. Do not create a generic key/value settings API, secret store, executable markup, or arbitrary HTML.
- [ ] Leave unknown initial values empty/unset until supplied by the owner/client. Audit changes without recording secret or full sensitive values.
- [ ] Keep public site/footer rendering for Phase 5.

**Acceptance:** Administrators can edit only allowlisted fields; malformed or unknown keys fail at both application and database boundaries. No unresolved site copy or destination is fabricated.

**Validation:** SQL allowlist/role tests, input validation tests, accessible admin browser checks, and focused/full documented gates.

## Task 15 — permanent deletion (decision-gated)

**Files:** None until the retention and reference-semantics decision is recorded. If approved, use a separately reviewed migration/operation, direct-denial tests, explicit-confirmation UI, media-reference checks, and docs.

**Interfaces:** The deletion signature, reference policy, and retention predicate remain undefined until the decision gate is accepted; no provisional callable operation is exposed.

**Test-first and commit boundary:** After approval only: RED archived-only/admin-only/confirmation/retry/history/media-reference cases; GREEN the narrow operation and explicit-confirmation UI, then preservation and rollback evidence.

- [ ] Do not implement or expose permanent deletion until the owner/client answers the retention question in `docs/product-requirements.md` and approves the treatment of revisions, surviving audit identifiers, actor Auth references, and unreferenced media.
- [ ] After approval, produce a focused deletion subplan and obtain review before migration. Permit only an administrator to delete an archived article with explicit confirmation; capture one audit effect and delete media only when no retained article references it.
- [ ] If no decision is available, leave this task visibly blocked and carry it forward. Do not claim Phase 4's deletion requirement is complete.

**Acceptance:** The task is complete only when the approved policy is implemented and verified; otherwise its unresolved status is documented without weakening data retention safeguards.

## Task 16 — integrated Phase 4 verification and handoff

**Files:** Update README/docs indexes as appropriate, API/data/security/component/testing/deployment docs, the parent Phase 4 plan, and a concise Phase 4 review/evidence map. Do not add features during verification.

**Interfaces:** Evidence map records the exact final commit, commands, counts, screenshots, migration upgrade result, review findings, PR check URL, and unresolved decisions.

**Test-first and commit boundary:** Run the smallest focused rechecks for any discovered defect before the full source-matching gates; commit only demonstrated fixes and evidence. Stop after the required proof passes or report a precise unavailable gate.

- [ ] Verify additive upgrade preservation from the completed Phase 3 Task 11 / PR #26 baseline and a clean install; keep existing database projects and data intact. Test real owner/admin/non-owner/credited/inactive/anonymous denials for every new operation.
- [ ] Run focused and full database tests, migrations/lint, generated type drift, unit/component tests, strict types, lint, formatting, production build, desktop/mobile browser journeys, unfiltered dependency/security scans, and exact-head hosted CI. Run only commands actually configured in the repository.
- [ ] Obtain a fresh whole-slice security/code review of every new migration, grant, storage policy, operation, route, and unresolved gate. Resolve Critical/Important findings with observed failing and passing regression checks.
- [ ] Verify accessibility behavior for dashboard forms/lists and upload interactions. Record automated evidence separately from any outstanding human screen-reader/security review, hosted OAuth/provider setup, and recovery exercise.
- [ ] Report permanent deletion as outstanding if Task 15 remains gated. Do not describe the entire MVP as complete while required public routes, search, or reader media rendering remain in Phase 5.

**Acceptance:** All completed Phase 4 features have matching docs, role/ownership denial coverage, local verification, fresh review, and CI evidence tied to the final commit. Unresolved client, policy, and human-review items are listed explicitly.

## Dependency order

`1 contract` → `2 generated slugs` → `3 image upload` → `4 rich media` → `5 published editing` → `6 owner lifecycle` → `7 admin archive/restore` → `8 article audit page` → `9 membership` → `10 contributors` → `11 taxonomy` → `12 own profile` → `13 homepage curation` → `14 site settings` → `15 deletion gate` → `16 integrated verification`.

Tasks 9–14 add their narrow audit actions/resources with their own mutations. Task 8's first version covers article history only. Public routes, search, archive pages, and media rendering are a separate Phase 5 plan.
