# Data model

Status: Foundation identity, content storage/read permissions and atomic private draft create/save implemented; editor/publishing remain planned.

## Storage

Supabase PostgreSQL is the authoritative relational store. Supabase Storage holds media objects; database records hold ownership, metadata, and references. Supabase Auth owns authentication identities.

## Relationship overview

```text
auth.users 1--0..1 profiles
auth.users 1--0..1 memberships
profiles 1--* owned articles
profiles *--* articles through article_contributors
sections 1--* categories
sections 1--* articles
articles *--* categories
articles *--* tags
articles 1--* revisions
articles *--* media_assets
auth.users 1--* audit_events
```

## Implemented foundation entities

### profiles

Public contributor identity, independent from login access.

| Field                   | Type          | Rules                                                                    |
| ----------------------- | ------------- | ------------------------------------------------------------------------ |
| id                      | UUID          | Primary key                                                              |
| auth_user_id            | UUID nullable | Unique reference to `auth.users`; null for contributors without accounts |
| display_name            | text          | Required                                                                 |
| slug                    | text          | Required, unique                                                         |
| biography               | text nullable | Sanitized public biography                                               |
| active                  | boolean       | Default true                                                             |
| created_at / updated_at | timestamptz   | Required                                                                 |

### memberships

| Field                    | Type                 | Rules                                  |
| ------------------------ | -------------------- | -------------------------------------- |
| user_id                  | UUID                 | Primary key; reference to `auth.users` |
| role                     | enum                 | `author` or `administrator`            |
| active                   | boolean              | Default false until approved           |
| approved_by              | UUID nullable        | Administrator identity                 |
| approved_at / revoked_at | timestamptz nullable | Lifecycle timestamps                   |

The migration `supabase/migrations/20261017000000_foundation_identity.sql` is authoritative for these two tables, their constraints, grants, indexes, helper functions, and RLS policies. `supabase/seed.sql` contains four synthetic, passwordless local identities covering inactive member, two authors, and administrator roles. It contains no production identity or content.

`profile_image_id` remains planned until the media schema exists. Biographies are stored as plain text; rich biography editing is not implemented.

Generated application types live at `src/lib/supabase/database/database.types.ts`. Regenerate them with `pnpm db:types` while local Supabase is running and verify drift with `pnpm db:types:check`.

`supabase/migrations/20261018000000_current_profile.sql` adds the parameterless `current_profile()` accessor used by server authorization. It returns only the caller's active profile ID/display name when membership is active, without exposing `auth_user_id` column grants to readers.

`supabase/migrations/20261018010000_identity_eligibility.sql` adds the trusted Auth identity predicate and tightens existing write/admin policies and the scoped accessor. This additive migration changes no stored rows or table columns. Existing application clients remain compatible; identities outside the approved boundary lose privileges intentionally. Apply it before deploying clients that depend on the consistent boundary. Reverting to earlier policies would weaken authorization and is not a safe security rollback.

## Implemented taxonomy

`supabase/migrations/20261021000000_content_taxonomy.sql` is authoritative for the `sections`, `categories`, and `tags` columns, constraints, indexes, updated-at triggers, grants, and RLS. It is an additive migration and changes no existing identity rows.

Sections and categories have names, canonical slugs, non-negative navigation order, and active state. Categories require a section; references restrict deletion and identity changes. Section names are case-insensitively unique and section slugs globally unique. Category names and slugs are unique within their section. Tags have globally unique canonical slugs and case-insensitively unique names, without activation or ordering fields. Names must be nonblank and trimmed; names and slugs accept 1–120 characters. All three tables supply UUIDs and creation/update timestamps.

Anonymous and ordinary authenticated readers see active sections and only active categories with active parents; all tags are readable. Eligible active administrators can also read inactive taxonomy. All application writes remain denied, including administrator writes. See [security controls](security-and-permissions.md#implemented-taxonomy-controls) and the [accepted contract](superpowers/specs/2026-10-21-content-foundation-design.md).

No real publication taxonomy is seeded. Fixtures are synthetic and transaction-local. Future tag-entry normalization, including Unicode and punctuation rules, remains unresolved until its create interface is designed. Article/category/tag/contributor links are implemented below; taxonomy management screens remain planned.

## Implemented article storage

`supabase/migrations/20261021010000_content_articles.sql` is authoritative for `articles`, `article_status`, constraints, indexes, triggers, grants, and the private read predicate. It adds storage without changing existing identity or taxonomy rows/policies.

An article requires an owner profile, primary section, trimmed nonblank title, and unique canonical slug. The [accepted content contract](superpowers/specs/2026-10-21-content-foundation-design.md#accepted-storage-constraints) defines the text bounds. Owner and section references restrict deletion and identity changes. UUIDs and timestamps are supplied automatically, and updates reuse the existing updated-at trigger.

New rows default to `draft`; excerpt, JSONB body, SEO keyphrase, and meta description may be SQL NULL. Present optional text must be trimmed and nonblank. Body storage permits only JSON objects of at most 1,048,576 serialized UTF-8 bytes. This does not validate editor nodes or safe rendering. No editor or renderer is implemented.

Draft rows require both lifecycle timestamps NULL; published rows require publication only; archived rows require publication and archive timestamps. These constraints describe stored states, not authorized transitions or publication readiness. Required publication content/media checks belong to the future publishing operation. Media columns are absent until the media contract exists; the eventual main-image requirement is unchanged.

Authenticated eligible active members read owned articles; eligible active administrators read all. The stable fixed-search-path `private.can_read_article(uuid)` resolves ownership through private profile Auth links and current membership without exposing those links or recursing through article RLS. Anonymous readers have no article grant, even for synthetic published rows. Every application write remains denied, including administrator writes. See [article security controls](security-and-permissions.md#implemented-private-article-controls).

## Implemented article/category links

`supabase/migrations/20261021020000_article_categories.sql` is authoritative for `article_categories`. Each row contains required `article_id`, `category_id`, and `section_id`, with primary key `(article_id, category_id)`. Both parent tables have unique `(id, section_id)` constraints; restrictive composite foreign keys require the link's section to match both parents. Changing either parent's section or identity while links exist is rejected, as is deleting a referenced parent. A reverse category/section index complements the article-leading primary key.

Privileged transactions may remove affected links, change a parent section, and attach only matching links atomically. Failed operations restore the original parent and links. This is an integrity capability exercised by transaction-local tests, not an application mutation interface. Normal application writes remain denied to every role, including administrators.

Association reads reuse the private article predicate: eligible active owners read their article's links and eligible active administrators read all. Anonymous, inactive, ineligible, and other-owner reads remain denied. Catalog visibility or untrusted credit-looking metadata grants no private association access. Actual contributor relationships and their denial tests are implemented below.

## Implemented article tags and credits

`supabase/migrations/20261021030000_article_tags_contributors.sql` is authoritative for `article_tags`, `article_contributors`, and `contribution_role`. Tag links require an article and tag, uniquely identified by that pair. Credits require an article, profile, and role (`writer`, `editor`, or `creative`), uniquely identified by all three. All parent references restrict deletion and identity changes. Reverse tag/profile indexes complement article-leading primary keys.

Credit display order defaults to zero, must be non-negative and non-NULL, and permits ties. One profile may hold different roles on the same article, but cannot repeat the same role. Profiles without Auth identities can receive credits. A future presentation layer must supply a deterministic tie-breaker; this migration introduces no renderer.

Both tables grant authenticated SELECT only, with RLS reusing the existing private article predicate. Actual credits never grant private article, category, tag, or credit access: a credited author on another owner's article still cannot read it. Owners retain read access without credits; eligible active administrators read all associations. All application writes remain denied, including administrator writes. No tag-entry normalization, create-tag operation, or credit-management interface is exposed.

## Implemented revision and audit storage

`supabase/migrations/20261021040000_content_history.sql` is authoritative for `article_revisions` and `audit_events`. Both have generated UUIDs, required actor Auth references, and creation timestamps. Actor references restrict identity changes/deletion. Revision article references also restrict changes/deletion; indexes cover article/resource and actor lookups.

Revisions require an article, snapshot version 1, and a JSON object snapshot of at most 2,097,152 serialized UTF-8 bytes. Owners and eligible active administrators read revisions through the existing private article predicate. A revision's actor or an article credit grants no read authority. Storage alone does not capture history or implement restoration. Phase 3 create-time capture is described below; restoration remains planned.

Audit rows contain only actor, allowlisted action, `article` resource type, resource UUID, creation time, and optional UUID correlation ID. The [accepted contract](superpowers/specs/2026-10-21-content-foundation-design.md#revision-and-audit-storage) defines the seven content actions. There is no arbitrary metadata, body, or snapshot column. Resource IDs have no article foreign key, so records can retain identifiers independently of current article rows. Only eligible active administrators read audits.

All application history insert/update/delete operations remain denied, including administrator operations and forged actors. These tables do not emit automatic events or provide an application mutation/capture API. They establish protected storage rather than a completed audit workflow. Restrictive references do not settle future identity-deletion or archive-retention policy; a later deletion design must reconcile those retained references before exposing deletion.

## Planned publishing entities

Taxonomy, private articles, category/tag/contributor links, and protected history storage are implemented above. Public article projections and all mutation/workflow interfaces remain unimplemented. Follow the [accepted contract](superpowers/specs/2026-10-21-content-foundation-design.md) for later Phase 2 storage slices.

### media_assets

Tracks owner/uploader, object path, media type, byte size, dimensions, checksum if used, alt text, creation time, and lifecycle state. Access remains subject to Storage and database policies.

### homepage_selections

Stores active lead, ordered Featured News, and ordered Read This selections. Referenced articles must be published; rendering falls back to eligible recent content when selections are missing.

### site_settings

Allowlisted editable values such as mission text, contact email, social URLs, and submission instructions. Do not create a generic store for secrets or executable content.

### slug_redirects

Maps previous public paths to current destinations when published slugs or routes change.

## Constraints and indexes

- Index published listings by status, section, and publication date.
- Index join tables by both sides of each relationship.
- Add search indexes appropriate to the selected PostgreSQL full-text approach.
- Use unique normalized slugs for public routes.
- Prevent non-administrators from changing ownership, role, audit, homepage-selection, or lifecycle fields outside permitted transitions.
- Use restrictive deletion behavior for referenced content; archive before permanent deletion.

## Migrations and seed data

- Store schema, grants, RLS policies, functions, and seed data as version-controlled Supabase migrations.
- Seed only synthetic development identities/content and the approved initial taxonomy.
- Test migrations from a clean database and from the previous committed schema.
- Favor additive, backward-compatible production changes; pair destructive changes with backup, rollout, and rollback steps.
- Legacy WordPress data migration is out of scope for the MVP.

Known deferred constraint: deleting an approving Auth identity is currently rejected by approval-state invariants despite the foreign key's `SET NULL` clause. Choose preserved-history versus deletion semantics before introducing infrastructure identity deletion procedures; ordinary membership deactivation does not delete Auth users.

Local reset, pgTAP, lint, and type generation require a running Docker-compatible container runtime. The local project is not linked to a hosted Supabase project.

## Phase 3 write support

The [accepted draft contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md) defines the edit version, private request-receipt/quota records and snapshot semantics implemented in the Task 3 migrations below. Generated public types include the new version field and create RPC. See [ADR 0007](decisions/0007-private-draft-editor-and-mutations.md) and the [implementation plan](superpowers/plans/2026-10-22-phase-three-private-drafts.md).

### Phase 3 write-state support

`20261022010000_draft_write_state.sql` adds `articles.edit_version` (existing/new rows default to 1) and private quota/receipt tables from the [accepted contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md#additive-support-and-transaction-rules). These tables contain bounded metadata, restrict actor deletion and expose no application privileges. This increment alone enables no mutation. Transactional upgrade evidence confirms pre-existing article fields remain unchanged when the default version is added.

`20261022010200_draft_snapshot.sql` adds private snapshot capture: a `gavel-article-snapshot` version-one envelope with an explicit 15-field article object and sorted category/tag/contributor selections. The helper preserves stored bodies and enforces the existing snapshot byte bound; UTC formatting avoids session-dependent timestamps. It creates no revision itself, grants no application execution, and enables no restore endpoint.

`20261022010100_draft_write_guards.sql` implements private locking/quota/hash helpers; `20261022010110_draft_numeric_order.sql` fixes canonical integer-valued credit orders through a new migration. `20261022010300_create_article_draft.sql` enables the narrow authenticated create transaction. Receipts have no article FK or body; actor references remain restrictive. All existing direct table grants/policies are unchanged.

### Versioned draft save boundary

`20261022020000_save_article_draft.sql` adds the save RPC and changes no table columns, existing rows or policies. It reuses the Task 3 version, private receipt/quota and snapshot state. An authorized changed save replaces allowlisted draft fields and associations under an article row lock, increments once and captures the resulting complete state. No-op receipts preserve version/time and emit no history. Old successful receipts return their original result without changing later content. Supported stored bodies are required before any new save; unsupported legacy data is preserved for a separately reviewed transition. The [API](api-contracts.md#implemented-versioned-draft-saving) defines observed error behavior.
