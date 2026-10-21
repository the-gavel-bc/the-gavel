# Phase 2 content foundation contract

- Status: Proposed for owner review; no schema or product decision in this document is accepted yet unless identified as an existing requirement.
- Date: 2026-10-21
- Implements: [Phase 2 task plan](../plans/2026-10-20-phase-two-content-foundation.md), [approved MVP design](2026-10-16-the-gavel-mvp-design.md)
- Authoritative requirements: [product](../../product-requirements.md), [data model](../../data-model.md), [security](../../security-and-permissions.md), [API conventions](../../api-contracts.md)

## Intent and phase boundary

Create a secure, tested content-data foundation for a later editor and publishing workflow. Keep the current application shells, user-scoped session boundary, and profile/membership policies intact. This phase adds no public article routes, editor, upload bucket, lifecycle endpoint, administrator UI, or external service.

Existing requirements already establish one owner, one primary section, private drafts/archives, no authority from credits, trusted Google identity plus active membership, administrator-wide content authority, and independent RLS. These are preserved. The concrete field bounds, storage choices, and phase-specific grants below are proposals requiring review, not claims that the earlier product document already decided them.

## Review decisions

| Decision             | Recommended proposal                                                                                                                                                                                                                                      | Alternative / effect                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Article body storage | Nullable PostgreSQL `jsonb` object with a serialized UTF-8 limit of 1 MiB. Do not store executable HTML. Full editor-node validation remains a prerequisite to later untrusted content writes/rendering.                                                  | Sanitized HTML needs a defined allowlist and sanitizer contract before body writes. Storage choice is currently awaiting the owner's answer.                                  |
| Incomplete drafts    | Require owner, section, a nonblank title, and a canonical slug. Permit absent excerpt, body, and SEO fields while draft.                                                                                                                                  | Requiring a complete excerpt/body at first save prevents incomplete drafts; accepting an untitled/unsectioned draft changes the required fields and needs an explicit choice. |
| Draft slugs          | Store an explicit canonical slug, reject collisions, and make no automatic renaming promise in this phase. Future draft UI can generate suggestions; post-publication changes require the separately planned redirect workflow.                           | Automatically suffixing or regenerating slugs changes URL expectations and is not selected here.                                                                              |
| Write boundary       | No new client write grants or mutation RPCs in this data-only phase, including administrator writes. Use privileged synthetic fixtures solely for database tests. Later workflow work must expose approved operations with atomic audit/revision capture. | Exposing direct writes now would require complete atomic capture, actor validation, and lifecycle enforcement in this phase, expanding it beyond storage.                     |
| History              | Owners and eligible active administrators may read their article revisions; only eligible active administrators may read audit records. All application writes/deletes to history remain denied.                                                          | More restrictive revision visibility can be chosen before implementation. No archive/deletion retention period is selected.                                                   |

The owner can approve the proposed package or change individual rows. Selecting JSON storage does not select an editor library, approve this full contract, or claim JSON itself is sanitized.

## Proposed storage constraints

Use UUID primary keys and `timestamptz` timestamps. Reuse the existing fixed-search-path `private.set_updated_at()` for mutable taxonomy/article rows. Use trimmed names/titles and explicitly reject blank strings; absent optional text is SQL NULL, not an empty string. Proposed character limits use PostgreSQL `char_length`; the JSON body bound uses `octet_length(content::text)`.

| Field family              | Proposed bound                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Section/category/tag name | 1–120 characters after trimming                                                                                 |
| Article title             | 1–240 characters after trimming                                                                                 |
| Article excerpt           | NULL or 1–600 characters after trimming                                                                         |
| Article slug              | 1–180 lowercase ASCII characters matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`                                          |
| Taxonomy slug             | 1–120 characters with the same canonical pattern                                                                |
| SEO keyphrase             | NULL or 1–160 characters after trimming                                                                         |
| Meta description          | NULL or 1–320 characters after trimming                                                                         |
| Display/navigation order  | Integer >= 0                                                                                                    |
| Article body              | NULL or JSON object, at most 1,048,576 serialized UTF-8 bytes; no renderer or untrusted write API in this phase |

These are proposed technical limits, not editorial recommendations. Validate boundary values and blank/over-limit input directly in pgTAP. A later editor contract must validate a closed node/attribute/URL schema, supported embeds, nesting/expansion bounds, and safe output before enabling body writes or display. This phase does not claim that bounded JSON is a valid rich article document.

### Taxonomy

- `sections`: `id`, `name`, `slug`, `navigation_order` default 0, `active` default true, `created_at`, `updated_at`. Unique slug and case-insensitive name.
- `categories`: same fields plus required `section_id` referencing sections. Unique slug and case-insensitive name within the parent section. A category cannot be publicly visible when either it or its section is inactive.
- `tags`: `id`, `name`, `slug`, `created_at`, `updated_at`. Unique slug and case-insensitive name globally; no tag activation lifecycle is introduced.
- Slugs are supplied in canonical form in Phase 2 fixtures; database validation rejects noncanonical input. Two different display names cannot claim the same canonical slug. Future tag-entry normalization, including Unicode transliteration and punctuation rules, must be specified before a create-tag interface is opened; do not silently choose it here.
- Use only synthetic taxonomy fixtures. Do not seed unresolved News categories, the disputed Features label, or assume final navigation visibility.

### Articles

- Required fields: `id`, `owner_profile_id`, `section_id`, `title`, `slug`, `status`, `created_at`, `updated_at`.
- Optional fields: `excerpt`, `content`, `seo_keyphrase`, `meta_description`, `published_at`, `archived_at`.
- Owner references `public.profiles(id)`; section references `public.sections(id)`. References use restrictive delete/update behavior. Auth linkage is resolved through existing profiles, never accepted as client authority.
- `status` uses exactly `draft`, `published`, `archived`, with default `draft`. Drafts have NULL publication/archive timestamps; published records require a publication timestamp and no archive timestamp; archived records require both. No new transition endpoint is exposed. This proposes archiving only previously published content; confirm before implementing because the product lifecycle does not explicitly settle abandoned-draft handling.
- Slug is unique globally. No public URL is changed or created by this schema-only phase.
- Defer `main_image_id`, image credit, and media relationships until the actual media schema and reference contract exist. This does not waive the approved main-image publication requirement; publication remains unimplemented.
- No reassignment/update/delete operation is exposed. Reassignment remains an administrator-only future operation with an audit record; author-supplied ownership cannot grant access.

### Associations

- `article_categories`: `(article_id, category_id)` primary key plus a required `section_id`. Composite foreign keys target `(id, section_id)` on both articles and categories, backed by unique constraints on those parent pairs.
- Updating either parent's section while links exist is rejected. A future authorized transaction can remove links, change section, and attach valid links atomically; this phase exposes no such operation.
- `article_tags`: `(article_id, tag_id)` primary key and restrictive parent references.
- `article_contributors`: `(article_id, profile_id, contribution_role)` primary key; role is exactly `writer`, `editor`, or `creative`; `display_order` defaults to 0 and must be >= 0. Order ties are allowed with a deterministic future display tiebreaker; they do not grant permission. A profile can hold multiple different roles on one article, but not duplicate the same role. Confirm this presentation rule during review.
- A credited profile need not have `auth_user_id`. Credit never grants private article/revision/association access, and an owner's edit rights come from ownership and membership, not credits.

### Revision and audit storage

- `article_revisions`: UUID `id`, required `article_id`, `actor_user_id`, `created_at`, integer `snapshot_version` default 1, and JSON object `snapshot`. Require version 1 and cap serialized snapshots at 2 MiB in this proposed first storage version.
- The snapshot is intended to capture article fields plus categories/tags/credits. Automatic capture, restoration, and untrusted snapshot writes are unimplemented. No policy may claim these are complete merely because the table exists.
- `audit_events`: UUID `id`, required `actor_user_id`, `action`, `resource_type`, `resource_id`, `created_at`, optional UUID `correlation_id`. Do not add arbitrary free-form metadata or article-body columns in this phase.
- Proposed content-event action values: `article.created`, `article.updated`, `article.published`, `article.archived`, `article.restored`, `article.deleted`, `article.owner_changed`. Taxonomy and other event domains require a reviewed additive extension when their workflows are implemented. No events are emitted by the Phase 2 application.
- `resource_type` is `article` in this first content storage slice; `resource_id` is a UUID without an article foreign key, so a future correctly authorized permanent deletion cannot cascade away its audit record.
- Actor references `auth.users` with restrictive delete behavior; revisions restrict article deletion. These are conservative integrity proposals for currently closed operations, not a resolution of the wider Auth-identity deletion or archive-retention policy. An eventual deletion design must explicitly reconcile retained revisions and actor identity references before exposing deletion.
- No app role can insert/update/delete revisions or audit records. Future atomic mutation functions must derive the actor from verified identity and current membership, validate payloads, and roll back article/history together on failure.

## Proposed Phase 2 permission matrix

This is the phase-specific data boundary. It does not replace the final MVP operation matrix or imply that administrator management screens exist.

| Data                                                        | Anonymous / inactive / ineligible identity | Eligible active owner         | Different eligible active author | Eligible active administrator                            |
| ----------------------------------------------------------- | ------------------------------------------ | ----------------------------- | -------------------------------- | -------------------------------------------------------- |
| Active sections/categories (active parent too) and tags     | Read catalog                               | Read catalog                  | Read catalog                     | Read all taxonomy including inactive sections/categories |
| Articles, including fixture records with non-draft statuses | No read                                    | Read own                      | No private cross-owner read      | Read all                                                 |
| Article categories/tags/credits                             | No read                                    | Read own article associations | No access from a credit          | Read all                                                 |
| Revisions                                                   | No read                                    | Read own article history      | No access from a credit          | Read all                                                 |
| Audit records                                               | No read                                    | No read                       | No read                          | Read                                                     |
| Any new-table insert/update/delete                          | Denied                                     | Denied                        | Denied                           | Denied                                                   |

Public article projections are deliberately not granted yet, even for synthetic published fixtures: content validation, publication, public field selection, and public routes belong to the later workflow plan. Before enabling those grants, implement the approved published-only filtering without exposing private columns/history. This is a conservative intermediate state, not a change to the final public-reader requirement.

Use explicit grants and RLS in each table's creation migration. Reuse `private.has_eligible_identity()` and `private.is_active_administrator()`. Add narrowly scoped, stable, fixed-search-path security-definer predicates only where needed to resolve profile/owner links without granting private identity columns or recursing through RLS. Revoke default PUBLIC execution, and scope authenticated execution deliberately. Do not expose a broad arbitrary-user lookup or service-role dependency.

## Proposed implementation slices and proof

After this contract is approved, refine the task plan into exact migration timestamps/function signatures/assertions before product code is written.

1. Taxonomy schema and catalog read policies: boundary/uniqueness/reference assertions, active-parent filtering, administrator inactive reads, and write denial for every role.
2. Articles and private owner/admin reads: synthetic anonymous/inactive/ineligible/two-author/admin checks; direct writes and status/owner spoofing denied. Existing profile/membership assertions remain green.
3. Category consistency: invalid link insert, article-side section change, category-side section change, duplicate link, unauthorized association reads, and referenced deletion all tested directly.
4. Tags/credits: duplicates, missing references, invalid roles/order, contributor without login, multiple-role proposal, and proof that credited Author B cannot read Author A's private article/history.
5. History storage: owner/admin revision reads, admin-only audit reads, all-role history write/tamper denial, references, snapshot bounds/version, and no article-body/private payload in audit columns. Do not claim atomic capture tests until capture exists.
6. Integration: generated types, clean reset, additive upgrade with preserved synthetic foundation rows/denials, local documented checks, and hosted CI.

Use existing dependencies and the colocated source convention. Application screens do not change. Migrations are additive; keep pre-phase migrations immutable. Do not implement rollback by dropping content tables containing data. If a new migration fails, stop or make a reviewed forward fix; reverting an unused application change does not authorize deleting records.

## Owner review needed

Confirm or revise the proposed body storage, incomplete-draft rules/field bounds, slug behavior, closed write boundary, archive-from-published rule, credit-role/order rules, and history/reference rules above. None is marked accepted by a general request to begin tasks.

The existing client questions about navigation, News categories, Features naming, retention, ownership of hosted services, and institutional policies remain unresolved in product-requirements.md. These do not need invented answers to test a local synthetic schema.

Task 1 remains in progress until the relevant choices and written contract are approved and the exact implementation steps are ready. Task 2 migrations must not begin before that gate.
