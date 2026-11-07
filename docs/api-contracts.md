# API contracts

## Implemented private draft main image

`request_article_image_upload(articleId,requestId)` reserves an opaque media asset for an authorized draft owner or active administrator. `POST /api/articles/[id]/media/[assetId]` accepts one bounded multipart `file`, validates and re-encodes JPEG/PNG/WebP to private WebP, then uses the server-only service role to finalize the checked reservation. `set_article_main_image(articleId,expectedVersion,requestId,assetId,altText,credit)` attaches a finalized same-article asset or unlinks with null asset/metadata. It returns the existing draft write result envelope, creates history on a change, and replays exact requests. These interfaces leave the Phase 3 draft payload and receipts unchanged.

`removeUnusedArticleImage(assetId)` first calls the user-scoped `mark_article_image_for_removal` RPC, then uses the server-only credential to remove the private object and call `complete_article_image_removal`. Current links and revision snapshots block removal. An interrupted cleanup leaves a `deleting` row for the same authorized caller to retry.

## Task 4 private body images

The existing `save_article_draft(articleId,expectedVersion,requestId,draft)` accepts canonical `gavel-draft` version 2 bodies with image blocks containing only `assetId`, required alt text (1–240 characters), and optional caption (1–500 characters). Version 1 bodies remain valid. Database save checks each asset is finalized for that article and reconciles body references in the same transaction as content, revision, audit, and retry receipt. Draft creation does not accept version 2 bodies because assets require an existing article. `GET /api/articles/[id]/media/[assetId]` serves a finalized same-article WebP only through the active caller's RLS-scoped client, with private no-store and nosniff headers. Video embeds remain unavailable pending a provider allowlist.

Status: Foundation access/session interfaces, Phase 2 private content/history storage, Phase 3 private draft queries/actions, and Phase 4 article lifecycle and administrator list/detail commands implemented. Public article reads remain planned.

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

All article associations and revisions follow article read authority; credits and revision actor IDs confer no additional access. Audit reads require an eligible active administrator. Article/category links enforce same-section membership through composite references. No application section-change, tag-entry, credit-management, or link-mutation interface is exposed. Private application article-fetch wrappers, editor UI, and restore are documented below; public projections remain planned. The narrow draft-create RPC and its atomic history capture are documented below. Generated database Insert/Update types describe the row shape; they do not grant write permission. All direct new-table application writes remain denied, including administrator writes.

## Planned public operations

- Fetch homepage composition.
- Fetch published article by slug.
- List published articles by section, category, tag, author, or letter type.
- Search published content.
- Fetch public author profile.
- Fetch public site information and navigation.

Anonymous operations return published, non-archived data only.

## Planned authenticated operations

The [accepted Phase 4 editorial contract](superpowers/specs/2026-11-01-editorial-workflow-design.md) fixes lifecycle authorization, receipts, generated slug behavior, and publication readiness. Phase 4 Task 2 removes article slug from strict new draft commands; the database derives it from title under a transaction lock. During mixed-version rollout, the database accepts a valid old slug field but ignores its value. Contributor slug operations remain planned.

- Update own public profile through the checked operation described below.
- Request and finalize valid image uploads.

Phase 4 Task 3 implements `request_article_image_upload(article_id,request_id)` for a stable owned-draft reservation and a checked server action that exposes only its safe receipt. `POST /api/articles/[id]/media/[assetId]` accepts one bounded multipart file, verifies the active actor and reserved article through the user-scoped client, decodes/re-encodes it to WebP, uploads it with a server-only service key, and calls the service-role-only finalization RPC. An exact finalized retry returns the confirmed asset ID; a matching Storage object can resume an uncertain upload. The route does not return object paths or secret values. `set_article_main_image(article_id,expected_version,request_id,asset_id,alt_text,credit)` is a checked versioned RPC; null asset/text/credit removes the link. It captures a revision/audit event only on a change and preserves exact retries. The dashboard attachment action and cleanup remain in progress. The browser never receives the service key.

## Implemented administrator membership operations

`list_membership_candidates(p_limit,p_state,p_before_email,p_before_user_id)` returns at most 51 safe summaries of eligible signed-in identities and existing members to an active administrator. State is `all | pending | active | inactive`; the keyset cursor orders by lowercase email and user ID. Results include email, public display name, role, state, edit version, and current eligibility, without exposing the private profile/Auth link. `list_membership_audit_events(p_limit,p_before_at,p_before_id)` separately returns bounded membership action, target email, actor public label, and time summaries. Neither reader changes Task 8's article audit scope.

`approve_membership(targetUserId,requestId,role,displayName,expectedVersion?)` requires an existing confirmed BC Google Auth identity. A first approval creates an active membership and linked public profile using the required display name and generated slug; reapproval restores an inactive membership and retains existing profile public fields. `change_membership_role(targetUserId,expectedVersion,requestId,role)` and `deactivate_membership(targetUserId,expectedVersion,requestId)` require an active target and matching version. All derive the actor, reject ineligible/nonadministrator callers, and enforce last-admin protection under one transaction lock. Changed operations atomically write one allowlisted audit event and immutable exact-retry receipt. A no-op records only its receipt; stale or mismatched requests fail without state changes. The server action accepts only these strict command shapes and preserves the UUID on uncertain retry. Auth identities are never created or deleted by these operations.

## Implemented administrator contributor operations

`list_admin_contributors(p_limit,p_state,p_before_slug,p_before_id)` returns at most 51 safe profile summaries to an eligible active administrator, ordered by slug and ID. State is `all | active | inactive`; results expose public name, slug, plain biography, active/version/frozen status, a linked-account boolean, and a live-reference boolean. No private `auth_user_id` is returned.

`create_guest_contributor(requestId,displayName,biography)`, `save_contributor_profile(profileId,expectedVersion,requestId,displayName,biography)`, and `deactivate_contributor_profile(profileId,expectedVersion,requestId)` accept bounded public fields only. Create always leaves `auth_user_id` null. The database derives a unique author slug from display name until first published ownership/credit, then freezes it. Deactivation fails while any published or archived article owns or credits the profile, or if it would disable the last eligible administrator. Actor, audit action, and immutable exact-retry receipt are server/database derived; changed writes atomically capture one `profile.*` event without biography text. Stale/reused requests fail safely. Direct authenticated profile writes are closed.

## Implemented own public profile operations

`get_own_public_profile()` returns only the eligible active caller's public name, slug, plain biography, edit version, and frozen state. `save_own_public_profile(expectedVersion,requestId,displayName,biography)` derives the profile from Auth and membership, accepts no target ID, slug, role, or identity link, and applies the same generated/frozen slug rule as administrator edits. A changed save records one `profile.updated` audit and exact-retry receipt atomically; a no-op records only its receipt. Stale versions return conflict. The dashboard preserves an uncertain request for exact retry and asks before discarding unsaved input on conflict reload. Profile images remain unavailable until a separate profile media contract exists.

## Implemented administrator taxonomy operations

`list_admin_taxonomy(kind,limit,afterId)` returns at most 51 section, category, or tag summaries to an eligible active administrator, ordered by ID. `update_section_taxonomy(id,expectedVersion,requestId,name,navigationOrder,active)` and `update_category_taxonomy(...)` update only existing records. Slugs, parent links, and article associations cannot be supplied. Changed operations atomically record one bounded audit event and an exact-retry receipt; stale versions or published/archived references return conflict. Category activation requires an active parent. The unresolved `Outside of BC` label cannot be renamed. Tags are read-only pending an approved normalization rule.

## Planned administrator operations

- Permanently delete archived article with explicit confirmation.
- Manage homepage selections.
- Manage allowlisted site settings.

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

## Implemented published article saving

`public.save_published_article(uuid,integer,uuid,jsonb)` accepts the same strict `SaveDraftCommand` article fields and `DraftWriteResult` envelope through `savePublishedArticleAction`. It derives actor and owner authority, requires current published status and expected version, and rejects unknown client fields including status, slug, owner and timestamps. A changed edit rechecks a supported nonempty body, active references, finalized body images, and a finalized main image with alt text and credit after locks. It changes only editable fields and associations, retains the slug/status/original publication time, and atomically writes body-image references, one revision, one `article.updated` event and the receipt. Exact retries and no-ops retain the draft boundary's semantics; archived and stale saves return `conflict`, unsupported stored bodies return `unsupported_content`, and missing/cross-owner IDs share `not_found`. Private upload, main-image mutation, publication and restore remain separate operations.

## Implemented owner article lifecycle

`publish_article(article_id,expected_version,request_id)` and `archive_article(article_id,expected_version,request_id)` accept only the strict three-field `ArticleLifecycleCommand` through separate server actions. Active owners or administrators may call them; credits grant no authority. Publish requires a draft with a supported nonblank body, active references, finalized body media and a finalized main image with alt text and credit. Archive requires published status but does not recheck readiness, so invalid old content can leave circulation. Both require the current version, preserve slug/owner, increment once, capture a complete revision and an allowlisted audit event, and store an exact replay receipt atomically. A successful response contains `articleId`, `status`, `version`, `updatedAt`, `changed`, and `replayed`; failures use the bounded draft error codes. Exact retries return their original receipt after later changes. No public read grant is implied.

## Implemented administrator article management

`getAdminArticlesPage({status?,search?,cursor?,pageSize?})` and `getAdminArticleDetail(articleId)` independently require active administrator access. The page defaults to 20 and accepts at most 50 rows, ordered by update time and ID descending. Status is `all | draft | published | archived`; title search is trimmed, at most 80 characters, and restricted to literal letters, numbers, spaces, apostrophes and hyphens. A strict cursor binds status and search. The queries select only safe title/status/owner-display-name/section-name/version/date fields, never article body or private identity links. Missing detail returns null; malformed input and read failures produce bounded errors.

`restore_article(article_id,expected_version,request_id)` uses the existing strict lifecycle command and result through `restoreArticleAction`. Only an active administrator may restore a currently archived, publication-ready article. It clears `archived_at` while retaining slug, owner and original `published_at`; version, complete revision, `article.restored` audit and exact receipt commit together. Lost-response retries keep the original command. Invalid archived content remains archived. No public read or direct table write is granted.

## Implemented administrator article audit read

`listAuditEvents({action?,cursor?,pageSize?})` independently requires active administrator access and calls `list_article_audit_events(p_limit,p_action,p_before_at,p_before_id)`. The function checks administrator eligibility again, accepts only the five implemented article actions, caps its result at 51 rows for a 50-row page plus sentinel, and orders by creation time and event ID descending. The versioned cursor binds the action filter. Results contain only event ID, action, article resource ID, timestamp, and actor display name or `Former member`; raw Auth IDs, correlation IDs, revision snapshots, and article bodies are not returned. Invalid inputs and database failures produce bounded errors. Article archival does not remove audit rows.

## Implemented private draft server boundary

Task 5 implements the following interfaces in `src/lib/articles/`. The [accepted contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md) remains authoritative for payload limits and write semantics. Routes/forms consuming these interfaces remain Tasks 6–10.

- `draft-queries/draft-queries.ts`: `getMyArticlesPage({cursor?,pageSize?}) -> ArticlePage` defaults to 20, accepts 1–50, and always filters the verified caller's profile, including administrators. Items contain only id/title/slug/status/sectionId/version/updatedAt. `nextCursor` is null or an opaque strict version-one UTC timestamp/UUID cursor ordered by `(updated_at DESC,id DESC)`, preserving database microseconds. The cursor supplies continuation, never authority.
- `getDraftDetail(articleId) -> DraftDetailResult`: one embedded read loads the article and associations under RLS. Authors also receive an explicit owner filter; administrators retain their existing detail authority. The discriminant `kind` is `editable`, `readOnly`, `unsupportedContent` or `notFound`. Editable draft and published results contain a validated `DraftInput`, status, articleId/version/updatedAt and unavailable selection IDs. Archived results contain status only; unsupported results contain status, ID and version for a published archive control but no stored body. Missing and RLS-hidden records share `notFound`.
- `getDraftOptions(sectionId?) -> DraftOptions`: active sections, categories under the selected active parent, existing tags and active contributor profiles. Explicit active filters apply even to administrators. Catalogs use stable ordered 500-row pages below the API row cap. No section means no category choices. Existing unavailable selection IDs remain in detail results for deliberate removal; the form provides generic labels without wider grants.
- Queries run at request time with the existing active-membership guard and cookie-scoped publishable-key client. The server client explicitly forces `cache: "no-store"`. Malformed inputs and read failures throw bounded safe errors; membership redirects propagate unchanged.
- `draft-actions/draft-actions.ts`: `createDraftAction(CreateDraftCommand)` and `saveDraftAction(SaveDraftCommand)` return `DraftWriteResult`. Strict envelopes reject unknown/protected fields before auth/RPC. Each accepted attempt uses verified current access and one user-scoped RPC with the caller's original request UUID. Missing/ineligible access returns `forbidden`; access/transport uncertainty or malformed responses return `unavailable`. No new UUID or automatic application retry is generated. Only checked result fields are returned, preserving replay/no-op metadata.
- Confirmed success revalidates `/dashboard` and the private `/dashboard/articles/<id>` path only. If revalidation fails after commit, the confirmed receipt still returns; a static private diagnostic includes only the request UUID. Request-time reads remain authoritative on refresh.

`experimental.serverActions.bodySizeLimit` is 4 MiB to accommodate Flight encoding and metadata around the accepted body. The draft body/request database limits remain unchanged. Pinned Next encoder tests exercise near-1-MiB ASCII, multibyte and escaped bodies; actual browser action dispatch and malformed-wire behavior will be tested when form routes exist. Default same-origin action protections are unchanged.

## Implemented draft form adapter

Task 7 adds `draftMetadataErrors` beside `checkDraftInput`, sharing the same metadata constraints for form feedback. The strict full-payload validator and database functions remain authoritative. The form maps exactly empty optional metadata to NULL; Tasks 8–9 added body and association input through the same full-payload contract. Phase 4 Task 2 removes editable article slugs and rejects a supplied `slug` in new application commands. The RPC signatures and result envelope remain unchanged; direct RPC calls with a valid old slug field ignore that value, and exact old slug-bearing receipts may replay. Its optional article/version prop uses the existing save command for the edit route.

Basic UI command state retains the submitted payload/request UUID until a success is confirmed. A later authorization or other failure cannot resolve an earlier unknown result, so those retries remain locked to the original command. A first definitive failure allows correction/new UUID. Confirmed creation opens the private edit route only when current input is acknowledged; if newer edits exist, the mounted form adopts the created resource and exposes Save draft for those edits. Task 10 implements editable-in-flight/conflict reconciliation; see [current form boundaries](component-hierarchy.md#implemented-new-draft-form).

## Implemented editor adapter and edit route

Task 8 implements `toEditorDocument(DraftDocument|null)` and `fromEditorDocument(unknown)` in `draft-document/`, returning checked editor/canonical results or safe `unsupported_content`/`invalid_input` failures. Native-only defaults are verified before normalization: ordered-list `type:null`, and links with fixed `_blank` target, `noopener noreferrer nofollow` rel and NULL class/title. Other meaningful fields are rejected. Native mark ordering follows the configured schema and is preserved; native export → canonical → native equality proves no formatting is lost.

`DraftEditor({value,onChange,onError,disabled})` is client-only, controlled through canonical values, with no callback on initial NULL load. Delayed echoes of emitted document objects cannot replace newer native edits; fresh external document values still replace the editor. The controller snapshots its latest input at submit time, including updates before React renders. Body errors block form submission and remain associated with the textbox across rerenders. Plain-text paste validates the prospective complete body before dispatch; rich clipboard formats and drops are rejected explicitly. Native edits that fail conversion remain visible/unsaved until corrected and participate in basic unload warnings. No raw HTML import or renderer is exposed.

`/dashboard/articles/[id]` consumes the existing guarded detail/options interfaces and reuses `DraftForm` with the current article/version. Confirmed creates open this route; confirmed edit saves update the controller's acknowledged version. Missing, read-only and unsupported states never expose a save operation. Task 9 allows deliberate repair of unavailable selections without discarding IDs. Existing draft mutation action/RPC signatures, direct-write denials and canonical limits are unchanged. Task 9 supplies selectors and usability validation; Task 10 supplies editable-in-flight/conflict/supported app-navigation reconciliation.

## Implemented draft category choice action

`getDraftCategoriesAction(sectionId: string)` independently checks current access without redirecting, validates the section UUID and uses the existing cookie-scoped no-store client. It returns `{ok:true,categories}` with the existing `DraftOptions["categories"]` shape, restricted to active categories in that section with an active parent, or safe `{ok:false,code:"invalid_input"|"forbidden"|"unavailable"}` feedback. A denied or unavailable access check does not read catalogs or navigate away from unsaved editor input. Reads paginate past the Data API row cap. It grants no write authority; existing create/save RPCs recheck all reference selections at commit.

## Implemented private draft recovery read

`reviewDraftAction(articleId)` validates the UUID and independently checks current active access, then consumes existing guarded detail/options queries. It returns `{ok:true,detail,options}` using `DraftDetailResult` and eligible `DraftOptions` only for editable results; other detail states carry NULL options. Failures return safe `invalid_input`, `forbidden` or `unavailable` codes. Read/access failures do not navigate away from local input. Existing owner/admin filtering, RLS, no-store behavior and unavailable-ID labels remain authoritative; a credit alone grants no detail or action access.

The pure `draft-save-state/` transitions and form controller are client interaction helpers, not new write authority. An unresolved mutation can be resolved only through its exact command/reply, not inferred from a detail read. Explicit local reload rejects a different article, an older known version or an unresolved write. An inconsistent resource/version receipt remains uncertain instead of adopting it. Reload replaces the active input/version together, retains in-memory local metadata/selections and the last valid canonical body for reference and never attaches a new version to an old payload as a force overwrite. All subsequent writes retain the existing checked create/save command signatures.
