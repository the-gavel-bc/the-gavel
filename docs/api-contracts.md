# API contracts

Status: Foundation access/session interfaces and Phase 2 private content/history read storage implemented; publishing operations remain planned.

## Style and ownership

Use typed Next.js server actions for dashboard mutations where appropriate and route handlers for URL-addressable operations such as search or OAuth callbacks. Supabase remains an external data boundary protected by grants and RLS.

Authoritative request schemas will live beside the implemented server operations and be shared with form validation where safe. Database migrations remain authoritative for stored constraints. Avoid maintaining conflicting schema copies.

## Conventions

- Content type: JSON for application operations; multipart or signed upload flows for approved media.
- Identifiers: UUIDs internally; normalized slugs for public routes.
- Time: UTC ISO 8601 at interfaces and `timestamptz` in PostgreSQL.
- Missing optional values use omission or explicit null according to the operation schema; do not overload empty strings.
- Pagination uses bounded page/cursor inputs and returns items plus continuation metadata.
- Public listing defaults to newest published first unless a curated order applies.
- Mutations require an authenticated server session, active membership, and role/ownership authorization.
- Errors use stable codes, safe messages, field details where useful, and a correlation identifier. Internal details remain private.
- Retried mutations must not create duplicate publication, deletion, or audit effects.
- Apply operation-specific rate limits.

## Implemented foundation interfaces

- `/sign-in` starts Google OAuth through a server action; the `bc.edu` provider hint is usability only. Server access checks require verified Google identity, a confirmed `bc.edu` email, active membership, and an active linked profile.
- `GET /auth/callback` exchanges the OAuth code with PKCE, then redirects to `/dashboard`, `/access-pending`, or a safe sign-in error. Redirect origins come from validated `SITE_URL`; optional `next` destinations are restricted to local dashboard paths.
- `getCurrentAccess()` returns `signedOut | pending | active`. Active access carries user ID, profile ID, display name, and role. `requireActiveMembership()` redirects denied identities; dashboard layout and page both call it.
- `public.current_profile()` is a parameterless database function returning only the active caller's profile ID/display name. Its grants, fixed search path, and membership filter are authoritative in the migration. It never exposes identity links from other profiles.
- Sign-out is a server action that clears the local Supabase session. Session cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS origins; the foundation browser client performs anonymous reads only.

## Implemented Phase 2 data reads

Taxonomy SELECT access, private article SELECT access, and category/tag/contributor association SELECT access are enforced by database grants/RLS; see the [data model](data-model.md#implemented-article-storage) and [security controls](security-and-permissions.md#implemented-private-article-controls). `private.can_read_article(check_article_id uuid) -> boolean` is an internal policy predicate for the authenticated caller, not a public mutation or arbitrary-user lookup RPC. It returns false for missing or unreadable article IDs. It does not accept an identity argument or expose private profile links.

All article associations and revisions follow article read authority; credits and revision actor IDs confer no additional access. Audit reads require an eligible active administrator. Article/category links enforce same-section membership through composite references. No application section-change, tag-entry, credit-management, or link-mutation interface is exposed. No application article-fetch wrapper, editor endpoint, public article projection, history capture/restore interface, or new mutation RPC is implemented yet. Generated database Insert/Update types describe the row shape; they do not grant write permission. All new-table application writes remain denied, including administrator writes.

## Planned public operations

- Fetch homepage composition.
- Fetch published article by slug.
- List published articles by section, category, tag, author, or letter type.
- Search published content.
- Fetch public author profile.
- Fetch public site information and navigation.

Anonymous operations return published, non-archived data only.

## Planned authenticated operations

- Fetch current membership and profile.
- List owned articles.
- Create article.
- Update owned article.
- Save draft.
- Publish now.
- Archive owned article.
- Update own public profile.
- Request and finalize valid image uploads.

## Planned administrator operations

- List and manage all articles.
- Restore archived article.
- Permanently delete archived article with explicit confirmation.
- Approve, change, or deactivate membership.
- Manage contributor profiles.
- Manage sections, categories, and tags.
- Manage homepage selections.
- Manage allowlisted site settings.
- Read paginated audit history.

## Validation rules

- Reject unknown fields on security-sensitive operations.
- Verify article lifecycle transitions explicitly.
- Verify category membership against the article's section.
- Normalize and deduplicate tags.
- Validate safe URLs and approved embed providers.
- Enforce bounded text, collection, pagination, and upload sizes.
- Do not accept owner, role, audit actor, or privileged lifecycle fields from unauthorized clients.

## Contract verification

Implementation must include schema tests, authorization tests, malformed-input tests, idempotency/regression coverage for sensitive mutations, and generated or manually maintained examples using synthetic data. An OpenAPI document is optional unless public HTTP APIs expand beyond the web application.

## Accepted Phase 3 interfaces — not implemented

The [accepted private-draft contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md) defines `create_article_draft(p_request_id uuid,p_draft jsonb)` and `save_article_draft(p_article_id uuid,p_expected_version integer,p_request_id uuid,p_draft jsonb)`, both returning JSONB. It is authoritative for document/request/result grammar, errors, pagination, retry/version/quota rules and complete history snapshots. [ADR 0007](decisions/0007-private-draft-editor-and-mutations.md) records the decision. No callable interface or grant is added by this acceptance; implementation follows the [task plan](superpowers/plans/2026-10-22-phase-three-private-drafts.md).
