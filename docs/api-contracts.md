# API contracts

Status: Foundation access/session interfaces, Phase 2 private content/history storage and Phase 3 private draft queries/actions implemented; editor UI and publishing operations remain planned.

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

All article associations and revisions follow article read authority; credits and revision actor IDs confer no additional access. Audit reads require an eligible active administrator. Article/category links enforce same-section membership through composite references. No application section-change, tag-entry, credit-management, or link-mutation interface is exposed. Private application article-fetch wrappers are implemented below; editor UI, public projections and restore interfaces remain planned. The narrow draft-create RPC and its atomic history capture are documented below. Generated database Insert/Update types describe the row shape; they do not grant write permission. All direct new-table application writes remain denied, including administrator writes.

## Planned public operations

- Fetch homepage composition.
- Fetch published article by slug.
- List published articles by section, category, tag, author, or letter type.
- Search published content.
- Fetch public author profile.
- Fetch public site information and navigation.

Anonymous operations return published, non-archived data only.

## Planned authenticated operations

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

## Accepted Phase 3 interface contract

The [accepted private-draft contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md) defines `create_article_draft(p_request_id uuid,p_draft jsonb)` and `save_article_draft(p_article_id uuid,p_expected_version integer,p_request_id uuid,p_draft jsonb)`, both returning JSONB. It is authoritative for document/request/result grammar, errors, pagination, retry/version/quota rules and complete history snapshots. [ADR 0007](decisions/0007-private-draft-editor-and-mutations.md) records the decision. Create and save are implemented below; application query/actions and editor UI remain planned. Implementation follows the [task plan](superpowers/plans/2026-10-22-phase-three-private-drafts.md).

## Implemented draft input validation

Phase 3 Task 2 adds `src/lib/articles/draft-contract/draft-contract.ts`: `checkDraftInput(unknown)` returns `{ok:true,value:DraftInput}` or a safe `DraftFailure`; `isValidDraftDocument(unknown)` and `isValidDraftLink(unknown)` expose the same content/link rules for future adapters. Create/save command and result types live here; the RPC and server action implementations are documented below. The [accepted contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md#draft-payload-and-content) remains authoritative for the grammar and bounds.

`supabase/migrations/20261022000000_draft_validation.sql` supplies private immutable invoker helpers `check_draft_input(jsonb)`, `is_valid_draft_document(jsonb)`, `is_valid_draft_link(text)` and their strict-key helper. They return canonical input or a validation failure without reading identity/catalog rows or writing data. UUIDs normalize to lowercase; category/tag IDs and profile/role credits sort deterministically. Display order is retained. Structural validation does not establish reference existence, activation or caller authority; Tasks 3–4 must enforce these under transaction locks.

The TypeScript byte helper counts JSONB spaces, string escaping and UTF-8 for JSON-safe integer values, rejecting incompatible Unicode, non-JSON values and excessive processing before content traversal. SQL applies bounds to actual JSONB serialization. JavaScript NULL denotes an incomplete body and corresponds to SQL NULL for the standalone document validator; JSONB `null` is not a document envelope. The enclosing request explicitly accepts `content: null` in both implementations. PostgreSQL rejects NUL/invalid surrogate encodings before a JSONB function can run. No raw HTML renderer, persistent draft writer or callable validation endpoint is enabled.

Internationalized hostnames, including all case-insensitive `xn--` labels, are deliberately rejected under the owner-approved Phase 3 restriction. Reintroducing them later requires matching standards-based validation at both boundaries; the document/editor architecture remains unchanged.

## Implemented draft creation

`public.create_article_draft(uuid,jsonb)` implements the accepted create contract. Only authenticated callers can execute it; the function derives owner/actor, locks and checks trusted identity/active profile/membership, serializes actor receipt/quota decisions, validates canonical input and locked selections, and atomically inserts the draft, links, complete revision, audit and receipt. Successful authorized replays return the stored result without a new attempt/history entry. Structured failures retain only eligible-caller quota bookkeeping; unexpected diagnostics expose only a safe error and are logged privately with SQLSTATE/request ID. Direct table writes remain denied. Save and server actions are implemented below; editor UI remains pending.

## Implemented versioned draft saving

`public.save_article_draft(uuid,integer,uuid,jsonb)` implements the accepted save boundary using the existing private guards, quota, canonical fingerprints and receipts. New writes require current owner/admin authority, draft status, supported stored content, the expected edit version and active valid selections. Changed saves atomically replace allowed fields/links and capture one revision/audit; semantic no-ops keep version/time and record only a receipt. Exact authorized retries return their original result even after later edits. Missing/cross-owner IDs share `not_found`; wrong status, stale/exhausted versions return `conflict`. Direct table writes remain denied; server actions are implemented below and editor UI remains pending.

## Implemented private draft server boundary

Task 5 implements the following interfaces in `src/lib/articles/`. The [accepted contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md) remains authoritative for payload limits and write semantics. Routes/forms consuming these interfaces remain Tasks 6–10.

- `draft-queries/draft-queries.ts`: `getMyArticlesPage({cursor?,pageSize?}) -> ArticlePage` defaults to 20, accepts 1–50, and always filters the verified caller's profile, including administrators. Items contain only id/title/slug/status/sectionId/version/updatedAt. `nextCursor` is null or an opaque strict version-one UTC timestamp/UUID cursor ordered by `(updated_at DESC,id DESC)`, preserving database microseconds. The cursor supplies continuation, never authority.
- `getDraftDetail(articleId) -> DraftDetailResult`: one embedded read loads the article and associations under RLS. Authors also receive an explicit owner filter; administrators retain their existing detail authority. The discriminant `kind` is `editable`, `readOnly`, `unsupportedContent` or `notFound`. Only editable results contain a validated `DraftInput`, articleId/version/updatedAt and unavailable selection IDs. Read-only results contain status only; unsupported results contain no stored body. Missing and RLS-hidden records share `notFound`.
- `getDraftOptions(sectionId?) -> DraftOptions`: active sections, categories under the selected active parent, existing tags and active contributor profiles. Explicit active filters apply even to administrators. Catalogs use stable ordered 500-row pages below the API row cap. No section means no category choices. Existing unavailable selection IDs remain in detail results for deliberate removal; the form will provide generic labels without wider grants.
- Queries run at request time with the existing active-membership guard and cookie-scoped publishable-key client. The server client explicitly forces `cache: "no-store"`. Malformed inputs and read failures throw bounded safe errors; membership redirects propagate unchanged.
- `draft-actions/draft-actions.ts`: `createDraftAction(CreateDraftCommand)` and `saveDraftAction(SaveDraftCommand)` return `DraftWriteResult`. Strict envelopes reject unknown/protected fields before auth/RPC. Each accepted attempt uses verified current access and one user-scoped RPC with the caller's original request UUID. Missing/ineligible access returns `forbidden`; access/transport uncertainty or malformed responses return `unavailable`. No new UUID or automatic application retry is generated. Only checked result fields are returned, preserving replay/no-op metadata.
- Confirmed success revalidates `/dashboard` and the private `/dashboard/articles/<id>` path only. If revalidation fails after commit, the confirmed receipt still returns; a static private diagnostic includes only the request UUID. Request-time reads remain authoritative on refresh.

`experimental.serverActions.bodySizeLimit` is 4 MiB to accommodate Flight encoding and metadata around the accepted body. The draft body/request database limits remain unchanged. Pinned Next encoder tests exercise near-1-MiB ASCII, multibyte and escaped bodies; actual browser action dispatch and malformed-wire behavior will be tested when form routes exist. Default same-origin action protections are unchanged.


## Implemented draft form adapter

Task 7 adds `draftMetadataErrors` beside `checkDraftInput`, sharing the same metadata constraints for form feedback. The strict full-payload validator and database functions remain authoritative. The new form maps exactly empty optional metadata to NULL, never silently trims/renames a slug, and creates only with NULL body/empty associations. It submits the existing `CreateDraftCommand`; no transport or database interface changed. Its optional article/version prop uses the existing save command for later route reuse.

Basic UI command state retains the submitted payload/request UUID until a success is confirmed. A later authorization or other failure cannot resolve an earlier unknown result, so those retries remain locked to the original command. A first definitive failure allows correction/new UUID. Confirmed creation navigates to My Articles and locks the form during that transition. Edit-in-flight/conflict reconciliation remains Task 10; see [current form boundaries](component-hierarchy.md#implemented-new-draft-form).
