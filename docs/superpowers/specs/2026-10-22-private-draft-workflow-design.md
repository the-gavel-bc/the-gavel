# Phase 3 private draft workflow contract

- Status: Accepted by the owner on 2026-10-22 ("looks good") after review of the written design/task proposal. The recommended Tiptap, explicit Save, versioned format, callable-write, retry/quota, and selection package is accepted; implementation is tracked separately.
- Date: 2026-10-22
- Intent: Continue the owner's requested Phase 3 task planning and execution after the Phase 2 data foundation.
- Accepted scope: The private-draft editor slice; publishing, uploads, and public article pages remain later work.
- Requirements: [Product](../../product-requirements.md), [architecture](../../architecture.md), [data model](../../data-model.md), [API](../../api-contracts.md), [security](../../security-and-permissions.md), [design system](../../design-system.md), and [accepted Phase 2 storage contract](2026-10-21-content-foundation-design.md).
- Execution plan: [Phase 3 implementation plan](../plans/2026-10-22-phase-three-private-drafts.md).

## Intended outcome

An eligible active author can list owned articles, create a private draft, edit its text/metadata/associations, save, reopen, and recover from validation/network/conflict errors without silently losing work. An eligible active administrator can edit another owner's draft through the same checked operation. Credits grant no permission. New articles are owned by the caller's linked active profile; this phase adds no owner reassignment.

Creation/editing applies only to draft records. Published and archived records retain the existing private read boundary and have no editing or transition operation in this phase. My Articles lists the caller's owned records, including for administrators; a full administrator listing/management screen remains later work. The editor must not display controls that imply unimplemented publication or upload behavior.

Existing Phase 2 field bounds, canonical slugs, relationships, and read permissions remain authoritative. No approval queue, scheduled publishing, collaboration service, analytics, new hosted service, or global client store is proposed.

## Accepted choices

| Topic             | Accepted approach                                                                                                                                           | Alternative / effect                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor            | Tiptap React editor, configured with an explicit small extension allowlist                                                                                  | Lexical is a viable alternative but needs a different document adapter and content contract; a plain textarea would omit the planned rich formatting                         |
| Saving            | Explicit Save, visible dirty/saving/saved/error states, and unsaved-navigation warning                                                                      | Autosave plus Save needs a defined debounce, history cadence, cancellation/retry behavior, and conflict interaction; not selected for this phase; explicit Save was accepted |
| Formatting        | Paragraphs, text, H2/H3, bold/italic, quotes, ordered/bullet lists, hard breaks, and validated HTTP/HTTPS links                                             | Images, embeds, arbitrary HTML/styles, tables, code blocks, and other extensions remain outside this slice; full MVP media support is not waived                             |
| Draft concurrency | An explicit monotonically increasing article version checked by the save operation; stale saves leave all stored rows unchanged                             | Last-write-wins can silently discard another tab's edits and is not recommended                                                                                              |
| Retry safety      | Caller-scoped request UUIDs with durable operation/result tracking; identical retries do not create extra articles, revisions, or audit events              | Transport failure must not be handled by issuing a fresh create/save command without knowing whether the original committed                                                  |
| Write authority   | Narrow authenticated create/save database operations with explicit trusted identity, active-profile/membership, owner/admin, status, and content validation | Broad direct table writes or a general elevated client would weaken the Phase 2 boundary and are not proposed                                                                |
| Taxonomy          | Choose existing active sections/categories, existing tags, and active contributor profiles; category IDs must match section                                 | Free-form tag creation and profile/taxonomy administration require separate contracts and are deferred                                                                       |

The owner accepted this recommended package. These are requirements for new implementation, not claims of installed dependencies or callable functions. No changes to unresolved client questions in product requirements are implied.

## Boundaries and data flow

1. Server pages/actions use the existing verified-session and active-membership guard and user-scoped Supabase client. Authenticated responses remain private/no-store.
2. Client components own editor/form interaction only. Render server-owned listing/data through small loaders; no private drafts in browser persistent storage or logs.
3. Validate a strict, bounded request envelope at the server boundary, rejecting unknown ownership/lifecycle/actor fields. Every callable database write boundary independently enforces the full content and authorization contract; direct RPC calls cannot bypass the server's checks.
4. Database create/save operations derive identity and actor from `auth.uid()`, resolve current eligible active membership/profile, and enforce ownership or existing active administrator authority. They grant no arbitrary-user lookup, reassignment, lifecycle change, or history-write endpoint.
5. In one transaction: validate, serialize conflicting edits, check version/request replay, create/update the draft and associations, capture a complete revision, and append `article.created` or `article.updated`. Any failure rolls everything back. Direct application table writes stay closed, including administrator writes.
6. Return only the committed article identifier/version/time needed by the form. Revalidate the private list/detail surfaces as needed; do not publish or populate public caches.

The privileged database functions require a fixed empty search path, fully qualified references, explicit execute revocation/grants, and denial tests inside the function body. This accepted extension of callable write authority still requires implementation/security review; a security-definer function's owner can bypass RLS, so grants alone are insufficient. No service-role credential is proposed.

## Content and history contract work

The stored body contract is a versioned envelope containing a strictly allowlisted editor document. The editor adapter should isolate Tiptap-specific serialization from form/persistence orchestration. SQL NULL remains a valid incomplete body; unknown legacy objects/versions must produce a safe unsupported-content state rather than silent coercion or overwrite. The existing 1 MiB serialized body and 2 MiB revision limits stay unchanged.

The accepted appendix below defines the envelope, grammar, bounds, snapshots, signatures, errors, request tracking, and write-rate rules. Autosave is excluded; introducing it later requires a reviewed scheduling/history contract. Follow the executable plan and test each boundary before enabling it. Runtime database validation is authoritative for persisted content and mutations, with client checks providing feedback. Test editor output against the database validator using shared adversarial and round-trip cases.

Links must reject executable/data protocols, credentials, control characters, and unsafe attributes; editor link behavior is controlled by the application. No arbitrary HTML rendering, URL previews, remote fetching, image upload, or video embedding is enabled. Pasted/imported and existing stored content must be validated before editor loading. Unrecognized content must not be silently removed and saved as a shortened document.

Revision snapshots must include the committed article fields and complete category/tag/contributor selections needed for a later restore design; actor and operation fields are derived internally. Snapshot construction, request tracking, and content/history rollback must be bounded and tested before opening any callable mutation. Snapshot storage does not implement restoration or change retention policy.

No history change is emitted for a failed, conflicting, or replayed command. The appendix defines no-op/replay/version semantics; the execution plan translates them into migrations and race/rollback tests. Preserve old rows through additive migrations; do not edit applied Phase 2 migrations.

## Accepted contract appendix

### Draft payload and content

`DraftInputV1` is a strict object with exactly `schemaVersion: 1`, `title`, `slug`, `sectionId`, `excerpt`, `content`, `seoKeyphrase`, `metaDescription`, `categoryIds`, `tagIds`, and `contributors`. Optional text/body is explicit NULL; association arrays may be empty. Each contributor has exactly `profileId`, `role`, and `displayOrder`. Reject unknown keys instead of accepting actor/owner/status/timestamp fields. Preserve Phase 2 scalar bounds, trimmed input and canonical slug rules; no silent server-side renaming.

Association bounds: 32 category IDs, 64 tag IDs, 32 credits; reject duplicates, including duplicate profile/role pairs. Validate active section/categories with matching parent, existing tags, active profiles including guests, the accepted credit roles, and nonnegative integer order. An existing inactive selection must be deliberately replaced/removed before saving; show unavailable IDs safely without widening catalog reads. Admins use the same active-selection rule for new writes. No automatic taxonomy/profile creation.

Non-NULL content has exactly `{ "format": "gavel-draft", "version": 1, "document": <document> }`. The 1 MiB bound includes this entire serialized envelope. Root document has `type: "doc"` and a nonempty array of blocks. Canonical grammar:

- Paragraph: `type: "paragraph"`, optional inline `content`.
- Heading: `type: "heading"`, exactly `attrs: {level: 2|3}`, optional inline `content`.
- Blockquote: `type: "blockquote"`, nonempty block `content`.
- Bullet list: `type: "bulletList"`, nonempty list-item `content`.
- Ordered list: `type: "orderedList"`, exactly `attrs: {start: integer 1..2147483647}`, nonempty list-item `content`.
- List item: `type: "listItem"`, `content` starting with a paragraph followed by zero or more blocks.
- Text: `type: "text"`, nonempty string `text`, optional `marks` array; each mark is uniquely `bold`, `italic`, or `link`.
- Hard break: exactly `type: "hardBreak"`. Inline content contains only text/hard breaks. Block content contains only paragraph/heading/blockquote/list nodes; it never contains another document root.
- Bold/italic marks contain only their type; a link mark contains its type and exactly `attrs: {href: string}`. No other node/mark properties, arbitrary attributes, HTML, event handlers, style or class are persisted.

Structural limits: at most 5,000 nodes, depth 16 including the root, three unique marks per text node, and link length 2,048 characters. Require canonical absolute lowercase `http://` or `https://` links, ASCII hostname without any case-insensitive `xn--` label, valid host/optional port, and no credentials, backslash, whitespace/control characters. Relative/mailto/data/javascript links and embeds are excluded from this first contract. The owner deferred internationalized domains on 2026-10-22; reject both raw internationalized hostnames and encoded punycode labels until a reviewed standards-based database/browser validator is added. This restriction concerns the hostname, not international text in article content or URL paths. No URL is fetched for preview. URL attributes are output-encoded; application-owned target/rel behavior is not controlled by stored content.

The editor adapter maps supported engine JSON into this canonical document. Any engine-generated default/decorative link attributes must be verified against fixed application settings before normalization; unknown or user-meaningful unsupported fields cause an error. No silent removal of unsupported stored content. Configure only matching extensions and test every native export/load shape against the canonical validator before enabling saves.

### Callable operations and errors

Accepted interfaces, not yet implemented RPCs:

- `public.create_article_draft(p_request_id uuid, p_draft jsonb) -> jsonb`.
- `public.save_article_draft(p_article_id uuid, p_expected_version integer, p_request_id uuid, p_draft jsonb) -> jsonb`.

Grant EXECUTE only to authenticated; explicitly revoke PUBLIC/anon. Fully qualify all references and pin an empty search path on privileged functions. Derive actor/owner, validate trusted identity/current active membership and linked active profile, and check owner/admin authority inside the function. Create derives caller ownership; save cannot change it and accepts only draft status. Ordinary clients retain no direct table/history mutation grants. No service-role client, generic mutation function or extra read privilege is introduced.

Success is `{ok:true, articleId, version, updatedAt, replayed, changed}`. Failure is `{ok:false, code, fieldErrors?}` with safe stable codes `invalid_input`, `unsupported_content`, `forbidden`, `not_found`, `conflict`, `slug_conflict`, `request_conflict`, `rate_limited`, or `unavailable`. Resource absence and cross-owner access share `not_found`; eligibility failures disclose no private resource details. Unexpected SQL diagnostics remain private and expose only a correlation identifier to the user.

Each draft JSON payload is capped at 1,100,000 serialized UTF-8 bytes before recursive processing, preserving the separate smaller body bound. Bound the Next.js action transport at 4 MiB to accommodate form/argument encoding; test near-limit allowed payloads and malformed encodings. Server actions independently validate their strict typed envelope, then call the authoritative database operation. Raw authenticated RPC calls cannot bypass content/security checks.

### Additive support and transaction rules

Add `articles.edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version >= 1)`. Existing articles receive version 1 without rewriting content/history. New drafts start at 1. A changed save checks the expected version under a row lock and increments once; version exhaustion returns a safe failure with no content change. Timestamps are feedback, never the concurrency token. Accepted requests update only the allowlisted draft fields/associations.

Add two small private tables, with no application SELECT/write grants and no article/body payload storage:

- `private.draft_write_receipts`: primary key `(actor_user_id, request_id)`, operation (`create`/`save`), article UUID, expected version (NULL for create), SHA-256 validated canonical payload fingerprint, resulting version/time, changed flag, creation time. Actor reference restricts deletion; resource UUID is retained independently of future article deletion. This table exists only to make uncertain retries deterministic.
- `private.draft_write_limits`: actor UUID primary key with restrictive Auth reference, window start, and attempt count. Serialize the actor's calls by locking this row before replay/quota decisions; no external rate-limit service is added.

Canonical payload comparison sorts category/tag IDs and credits by profile/role after validating them; changing credit order values is meaningful. The already available PostgreSQL SHA-256 function fingerprints the canonical request plus operation/resource/expected version. A completed request ID reused by that actor with different input returns `request_conflict`. Concurrent identical requests yield one committed operation and one replay. Recheck current authorization before replay; the prior committed result can be returned without overwriting later article edits.

Quota: 30 new command attempts per actor per fixed 60-second window; exact successful replays do not consume quota. Validation errors/no-op requests count, so rejected payloads are not a free validation loop. Ordinary structured failures commit only the private quota bookkeeping. Perform content/association/version/history/receipt work inside a guarded subtransaction: any business failure restores all article, association, revision, audit and receipt rows. Connection/transaction failure may also roll back quota state; retry remains idempotent. Test duplicate requests, window boundaries and failure paths through the real callable operation, not a UI throttle. Deployment request limits remain additional pre-launch controls, not a claim of protection against every infrastructure-level flood.

For changed saves, atomically replace associations using the accepted same-section rules, then capture the resulting complete snapshot and one audit row. Create captures one revision and `article.created`; changed save captures one revision and `article.updated`. Audit correlation ID is the request UUID. A semantic no-op returns unchanged version/time, records a request receipt, and emits no revision or audit row. No failed/conflicting/replayed command emits content history. Active identity/profile/membership and selected reference checks must remain valid through the write transaction; concurrency tests cover deactivation and taxonomy changes while saving.

Capture snapshot version 1 as a closed envelope containing format/version, the committed article's scalar fields including identity/ownership/status/timestamps/edit version, sorted category/tag ID arrays, and sorted contributor entries including display order. Enforce the existing 2 MiB serialized snapshot limit. Snapshot construction is internal, never accepted from the caller. Older privileged fixtures/history remain readable; new capture does not silently normalize old bodies or promise a restore operation. Private request records are not purged automatically; future retention/identity-deletion work must reconcile all references and retry guarantees explicitly.

### List and save interaction

My Articles always filters by the caller's profile, including administrators; existing RLS remains defense in depth. Use default page size 20, maximum 50, ordered by `updated_at DESC, id DESC`, with a strictly validated opaque version-one timestamp/UUID cursor. Preserve database timestamp precision rather than round-tripping it through a millisecond-only comparison. Detail reads use existing owner/admin authority; published/archived records have a safe read-only/unavailable-edit state.

Explicit-save mode uses a stable request UUID per submitted state and a fresh one for a deliberate new command. Retry an uncertain request with the same UUID/payload; do not change its expected version. A stale tab keeps local values and offers reload/reconciliation rather than force overwrite. A response to an older form state cannot mark newer edits saved. Network/offline behavior preserves in-memory input and honestly states when it has not been committed. Autosave and persistent crash recovery are outside this accepted phase.

## UI and error behavior

Use the planned `/dashboard`, `/dashboard/articles/new`, and `/dashboard/articles/[id]` routes. Colocate every component/module with its CSS Modules, existing tests, schemas, and owned support files under the established convention. Keep route transport, validation, persistence, and editor concerns separate.

Creation requires the already accepted title/section/canonical slug. Suggesting a slug is usability; global collision remains an explicit field error with no silent renaming. Optional metadata and body preserve existing NULL rules. Association selectors must not create new tags/profiles or leave categories from a previous section attached. Section changes require deliberate review of affected categories before saving.

Errors distinguish validation, forbidden/not-found, unsupported content, stale version, and recoverable transport failure without exposing private records or internal SQL details. A conflict preserves local edits and offers safe reload/reconciliation; no force-overwrite shortcut is enabled. An edit made while a save is in flight must remain dirty after that save completes. Failed saves must preserve form contents. No localStorage/sessionStorage draft backup is enabled.

Persistent labels, keyboard-operable toolbar/selectors, associated/announced errors, visible focus, appropriate mobile layout, and explicit loading/empty/saving/dirty states are required. Browser unload warnings are best-effort and cannot guarantee recovery after a crash or power loss. Manual keyboard/screen-reader review accompanies automated tests.

## Verification and stopping point

Tests must cover anonymous/inactive/ineligible/two-author/admin identities, real contributor and actor non-authority, wrong-status writes, unknown/protected fields, malformed/oversized/deep documents, unsafe URLs, invalid/duplicate associations, concurrent tabs, duplicate requests, conflict/no-op behavior, and rollback if revision/audit capture fails. Keep the existing 648 database assertions passing; add focused SQL and application/browser suites for each new boundary.

The slice ends when private draft create/edit/save/reopen works with tested atomic history, safe content, permission enforcement, accessible states, documented contracts, generated types, and successful local/hosted gates. It does not require a hosted Supabase project for synthetic local verification. Real content use requires confirmed taxonomy; tests/dev review use clearly synthetic local fixtures rather than inventing unresolved labels.

## Research checked on 2026-10-22

- [Tiptap Next.js integration](https://tiptap.dev/docs/editor/getting-started/install/nextjs) documents the React client component integration and `immediatelyRender: false` for SSR/hydration compatibility.
- [Tiptap schema](https://tiptap.dev/docs/editor/core-concepts/schema) describes schema-constrained nodes, attributes, and nesting. Editor-side filtering does not replace trusted write validation.
- [StarterKit configuration](https://tiptap.dev/docs/editor/extensions/functionality/starterkit) supports configuring/disabling included extensions; do not enable the whole kit without matching the accepted content contract.
- [Lexical's official repository](https://github.com/facebook/lexical) describes React bindings and JSON serialization; it remains an alternative, not an installed dependency.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions) explains function privileges, security-definer identity checks, and fixed search paths.

Exact package versions, peer compatibility with the pinned stack, licensing, transitive audit/bundle impact, and the final enabled extension set must be checked before installation. No cloud/editor service or paid extension is proposed.
