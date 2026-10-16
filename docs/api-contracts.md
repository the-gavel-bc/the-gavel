# API contracts

Status: Approved conventions and operation inventory — concrete schemas are not implemented.

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
