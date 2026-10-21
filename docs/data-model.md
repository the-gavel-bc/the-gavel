# Data model

Status: Foundation identity schema implemented; publishing entities remain conceptual.

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

## Planned publishing entities

The [accepted Phase 2 content contract](superpowers/specs/2026-10-21-content-foundation-design.md) defines approved field bounds and phase-specific permissions. The design is accepted; its publishing tables are not implemented yet.

### articles

| Field                   | Type                                     | Rules                                                                       |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| id                      | UUID                                     | Primary key                                                                 |
| owner_profile_id        | UUID                                     | Required; exactly one owner                                                 |
| section_id              | UUID                                     | Required                                                                    |
| title                   | text                                     | Required; bounded length                                                    |
| slug                    | text                                     | Required, unique and stable after publication except managed redirects      |
| excerpt                 | text                                     | Required for cards and metadata fallback                                    |
| content                 | structured JSON or constrained rich text | Required before publication                                                 |
| status                  | enum                                     | `draft`, `published`, or `archived`                                         |
| main_image_id           | UUID nullable                            | Required before publication unless an editorial exception is approved later |
| image_credit            | text nullable                            | Public credit                                                               |
| seo_keyphrase           | text nullable                            | Editorial aid                                                               |
| meta_description        | text nullable                            | Bounded search/social description                                           |
| published_at            | timestamptz nullable                     | Set on first publication                                                    |
| archived_at             | timestamptz nullable                     | Set while archived                                                          |
| created_at / updated_at | timestamptz                              | Required                                                                    |

### article_contributors

| Field             | Type    | Rules                             |
| ----------------- | ------- | --------------------------------- |
| article_id        | UUID    | Required                          |
| profile_id        | UUID    | Required                          |
| contribution_role | enum    | `writer`, `editor`, or `creative` |
| display_order     | integer | Non-negative                      |

Credits do not grant edit access. The owner may also have a writer credit.

### sections and categories

Sections have unique names/slugs, navigation order, and active state. Categories belong to exactly one section and have names/slugs unique within that section. `article_categories` provides the many-to-many relationship; constraints ensure selected categories belong to the article's primary section.

### tags

Tags have a canonical name and unique normalized slug. `article_tags` associates zero or more tags with an article. Normalize case and punctuation to prevent duplicates.

### media_assets

Tracks owner/uploader, object path, media type, byte size, dimensions, checksum if used, alt text, creation time, and lifecycle state. Access remains subject to Storage and database policies.

### article_revisions

Immutable snapshots sufficient to restore prior title, excerpt, content, taxonomy, credits, and metadata. Record article, editor identity, creation time, and revision payload/version.

### homepage_selections

Stores active lead, ordered Featured News, and ordered Read This selections. Referenced articles must be published; rendering falls back to eligible recent content when selections are missing.

### site_settings

Allowlisted editable values such as mission text, contact email, social URLs, and submission instructions. Do not create a generic store for secrets or executable content.

### audit_events

Append-only records containing actor, action, resource type/id, timestamp, request correlation identifier where available, and safe metadata. Never store tokens or full sensitive payloads.

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
