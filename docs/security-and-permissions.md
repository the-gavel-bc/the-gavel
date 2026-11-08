# Security and permissions

Status: Foundation access/session controls, Phase 2 content/history read permissions, and checked Phase 4 publish/archive transitions implemented; public article reads and hosted provider controls remain planned.

Phase 4 private article media uses a server-only Supabase service-role key for validated WebP Storage writes and cleanup. Reservation, attachment, and removal still begin with active user-scoped checks; trusted finalization and completion independently check the claimed actor and asset state. The private bucket has no direct browser write grant. Finalized objects are readable only for an authorized article reader; pending, uploading, or deleting objects are hidden. Current and historical article image references block physical deletion.

## Security objective

The project replaces a previously compromised WordPress site. The new system minimizes the attack surface, avoids executable plugin/theme uploads, separates application and infrastructure permissions, and applies authorization in both server code and PostgreSQL Row Level Security.

## Authentication

- Identity provider: Google through Supabase Auth.
- Allowed organization domain: `bc.edu`.
- Dashboard eligibility additionally requires an active administrator-approved membership.
- Google identity alone never grants author access.
- Server code validates the active session; client-decoded claims are not authoritative.
- Authentication tokens must not appear in URLs, logs, analytics, or user-visible errors.
- Infrastructure administrators must enable MFA.
- Logout must invalidate the local session; an administrator can deactivate application access independently of Google.

### Implemented foundation access

The server verifies identity with Supabase `getUser()` before checking trusted Google provider metadata, confirmed `bc.edu` email, active membership, and linked profile. Proxy refreshes verified tokens but does not authorize dashboard access. Both the dashboard layout and page independently require active membership. Auth responses are private/no-store. OAuth callback destinations use the configured canonical origin and allow only dashboard-local paths. Session cookies are HttpOnly, SameSite=Lax, and Secure for HTTPS deployments.

Google provider configuration and hosted domain restrictions remain manual launch work; automated browser tests use signed synthetic local sessions, without real Google credentials or production data. Profile reads retain private authentication links; `current_profile()` exposes only the active caller's ID and display name through a parameterless, fixed-search-path function.

## Authorization matrix

| Action                                          | Public |     Author | Administrator |
| ----------------------------------------------- | -----: | ---------: | ------------: |
| Read published content                          |    Yes |        Yes |           Yes |
| Read own drafts/archives                        |     No |        Yes |           Yes |
| Read another author's drafts/archives           |     No |         No |           Yes |
| Create an article                               |     No |        Yes |           Yes |
| Edit an article                                 |     No | Owner only |           Any |
| Publish an article                              |     No | Owner only |           Any |
| Archive an article                              |     No | Owner only |           Any |
| Restore an archived article                     |     No |         No |           Yes |
| Permanently delete an archived article          |     No |         No |           Yes |
| Edit own public profile                         |     No |        Yes |           Yes |
| Manage memberships and roles                    |     No |         No |           Yes |
| Manage taxonomy, homepage, and site information |     No |         No |           Yes |
| Review audit history                            |     No |         No |           Yes |

Additional credits never imply ownership. Each article has one designated owner.

## Database and API controls

Implemented foundation controls:

- `profiles` and `memberships` have RLS enabled and explicit grants.
- Direct profile writes, administrator membership privileges, and `current_profile()` additionally require authoritative Auth data: confirmed `bc.edu` email and trusted Google provider metadata. `private.has_eligible_identity()` reads these fields through a fixed-search-path predicate; caller-editable user metadata never grants access.
- Anonymous readers can select only public profile columns and only active profile rows; authentication links are not granted.
- Task 10 closes direct authenticated profile UPDATE grants and the owner/admin update policy. Administrators use checked guest-create, public-field save, and deactivation RPCs. Task 12 adds a separate own-only read/save boundary deriving the profile from eligible active Auth and membership; neither accepts an editable identity link, role, or caller-chosen slug. Publication/credit triggers serialize with profile writes and freeze slugs; published/archived references and the last eligible administrator block deactivation.
- Authenticated users can read only their own membership unless they hold an active administrator membership.
- Active administrators manage memberships through three checked RPCs. Direct authenticated INSERT/UPDATE/DELETE grants and mutation policies were removed in Task 9. Each operation derives the actor from `auth.uid()`, verifies trusted identity and active administrator access, and records a bounded audit event atomically. The last eligible active administrator cannot be demoted or deactivated; a transaction lock serializes competing changes.
- Normal authors and inactive members cannot insert, update, delete, or read another user's membership.
- Synthetic pgTAP fixtures cover anonymous, inactive, Author A, Author B, and administrator paths.

The following requirements continue to govern later tables and operations:

- Enable RLS and explicit grants on every exposed table, view, function, and Storage bucket.
- Test permitted and forbidden operations for anonymous, author, inactive-member, and administrator identities.
- Keep Supabase secret/service-role credentials server-only and narrowly scoped.
- Prefer user-scoped operations subject to RLS; elevated credentials are reserved for necessary administrative tasks.
- Protect privileged database functions with fixed search paths, explicit grants, validated inputs, and review.
- Enforce ownership, lifecycle, and relational integrity in the database as well as application logic.

### Implemented taxonomy controls

`sections`, `categories`, and `tags` ship with RLS and SELECT-only grants for anonymous and authenticated roles. There are no application insert/update/delete grants or mutation policies, even for administrators. Privileged test fixtures do not represent application write access.

Anonymous and ordinary authenticated readers see active sections and active categories only when their parent section is active, plus all tags. Separate anonymous policies avoid invoking private administrator helpers. Authenticated policies reuse the existing trusted-identity/active-administrator predicate to allow inactive taxonomy reads only for eligible active administrators. Inactive memberships and non-Google, unconfirmed, or out-of-domain identities receive no expanded visibility. These policies do not change foundation profile or membership permissions.

Task 11 provides administrator-only bounded taxonomy summaries and checked existing-section/category updates. Actor identity is derived from Auth, versioned writes and exact retries record only allowlisted audit metadata, and direct table writes remain closed. Section/category locks serialize deactivation with publication validation; published and archived references block deactivation. Parent, slug, and article links cannot be supplied or changed. Tags are read-only pending normalization approval, and the unresolved `Outside of BC` label is protected. Public article reads remain future work.

### Homepage curation controls

Task 13 grants eligible active administrators only checked save/read RPCs. Direct anonymous and authenticated access to curation tables is denied. Saves lock and recheck selected published articles, derive the actor, serialize version/receipt updates, and atomically record bounded audit metadata. The administrator reader returns only safe ID/title/status summaries and published-only fallback results. Archival after selection leaves the stored link intact and removes the article from the effective preview. No public article or homepage read grant is added.

### Implemented private article controls

`articles` has RLS and a SELECT grant only for authenticated users. Its single read policy calls `private.can_read_article(uuid)`: trusted Google identity, confirmed `bc.edu` email, and current active membership are required, followed by ownership through the profile Auth link or the existing active-administrator predicate. Supplying another article ID cannot change the caller's identity. The predicate is stable and security-definer with an empty search path, fully qualified references, and execution restricted to authenticated users; its private schema is not a public RPC surface.

Anonymous readers have no article grant, including published fixtures. Inactive or ineligible identities receive no rows. Authors cannot read another owner's draft/archive/published fixture. Read authority does not depend on credits. Private `profiles.auth_user_id` stays inaccessible to clients. All article inserts, updates (including owner/lifecycle changes), and deletes are denied to every application role, including administrators.

This is the accepted intermediate Phase 2 boundary. Final public article access, editor mutations, publishing/archiving/reassignment, validation, and atomic history capture require later interfaces. Stored JSON shape and byte bounds do not establish safe rich content. No application screen or public URL changes in this task; existing session and profile/membership policies are preserved.

### Implemented article/category controls

`article_categories` enables RLS and grants SELECT only to authenticated users, with its single read policy reusing `private.can_read_article(article_id)`. It adds no helper or public RPC and changes no existing policies. Anonymous users have no grant; owners cannot read other owners' links; inactive/ineligible identities receive no rows. Untrusted credit-looking claims never confer access. All application inserts, updates, and deletes remain denied, including administrator operations.

Composite restrictive foreign keys enforce section consistency for association writes and both parent updates/deletions. Tests exercise these constraints as privileged fixtures, including full rollback after failed link replacement. These tests do not expose an application section-change operation or establish future atomic history capture. No UI or public route changes in this task.

### Implemented tag and credit controls

`article_tags` and `article_contributors` enable RLS, grant SELECT only to authenticated users, and reuse `private.can_read_article(article_id)`. No policy checks a credited profile as authority. Tests give Author B real writer/editor credits on Author A's article and still deny B access to that article and all private associations. Owner reads do not require a credit. Anonymous users have no grants; inactive/ineligible identities receive no rows; eligible active administrators read all associations. All application writes remain denied, including administrators.

Required restrictive parent references and unique association keys prevent dangling/duplicate links. A guest profile without login can receive credit without gaining a session or permissions. This migration adds no helper, public RPC, tag-entry normalization, mutation interface, or UI and changes no earlier policy. Contributor rendering, atomic mutation/history capture, and public projections remain future work.

### Implemented history controls

`article_revisions` and `audit_events` enable RLS with authenticated SELECT-only grants. Revision reads reuse `private.can_read_article(article_id)`; audit reads use `private.is_active_administrator()`. Neither actor identity nor contributor credit confers access. Anonymous users have no table grants; inactive/ineligible identities receive no rows. Ordinary owners cannot read audit records. All application insert/update/delete operations remain denied, including administrator tampering and forged actor fields.

Revisions require version-one bounded JSON objects. Audits permit only the seven accepted content actions and the closed metadata column set, with no article body or arbitrary payload. References protect actors and revision articles, while audit resource identifiers deliberately survive independently of article rows. These constraints add no capture, restore, delete, or mutation interface and change no earlier policy/helper. Future writes must derive the actor from trusted identity and commit content/history atomically; no automatic capture is claimed here.

## Content and input safety

The [accepted Phase 4 editorial contract](superpowers/specs/2026-11-01-editorial-workflow-design.md) defines checked lifecycle operations, noneditable generated slugs, and a last-eligible-administrator guard. Phase 4 Task 2 enforces generated article slugs at the draft RPC boundary: valid older slug fields are ignored, malformed values fail, and exact older receipts remain replayable. Task 9 closes direct membership writes and guards the last eligible administrator. Task 10 closes direct profile updates, derives contributor slugs from names, and freezes them after publication.

- Validate all request bodies, query parameters, identifiers, slugs, dates, URLs, and pagination limits.
- Store structured content or a constrained rich-text representation.
- Sanitize rich content on the trusted server boundary.
- Reject arbitrary HTML, scripts, styles, event handlers, objects, forms, and unapproved iframes.
- Permit video embeds only from an explicit provider allowlist.
- Encode untrusted text for its output context.
- Validate redirect targets and allow only intended local or approved external destinations.

## Upload controls

Phase 4 Task 3's additive migrations reserve article media through a checked owner/administrator RPC. Authenticated callers cannot directly insert, update, or delete media rows or finalize them; the finalization RPC is service-role-only and independently checks the claimed actor, article, validated metadata, and trusted Storage object. The private bucket exposes finalized reads only to eligible article owners/administrators through Storage RLS. The server-only image processor bounds multipart and decoded JPEG/PNG/WebP inputs, re-encodes to metadata-stripped WebP, and records a SHA-256 digest. Sharp is an explicit dependency because actual decoding and re-encoding are required. The upload route verifies the active actor and reserved article before opening the privileged Storage client and never returns the service key or object path. Uncertain finalization leaves the object in the private bucket for safe retry. A separate checked main-image RPC requires a finalized asset on the same article, validates alt/credit, and blocks direct link writes; a restrictive foreign key prevents deletion while attached. Dashboard attachment and cleanup are still being built.

- MVP image types: JPEG, PNG, and WebP.
- Do not accept SVG, HTML, archives, executables, or arbitrary attachments.
- Limit file size and decoded dimensions.
- Verify actual content rather than trusting extensions or declared MIME types.
- Generate storage identifiers; never use user filenames as executable paths.
- Re-encode images and remove unnecessary metadata where practical.
- Enforce uploader ownership and administrator override with Storage RLS.
- Serve uploads with correct content types and non-executable behavior.
- Delete media only after confirming that no retained article references it.

## Browser and edge controls

- HTTPS only.
- Secure, HttpOnly, appropriately scoped session cookies.
- Content Security Policy tailored to the application and approved integrations.
- HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and CSP frame protection.
- CSRF protection for cookie-authenticated mutations.
- Rate limits for authentication, search, uploads, and mutations.
- Vercel firewall/bot controls and protected preview deployments.
- No sensitive dashboard responses in shared caches.

## Secrets and service ownership

- Store production secrets in managed environment configuration, never in Git or `NEXT_PUBLIC_*` variables.
- Separate local, preview, and production credentials.
- Rotate credentials after suspected exposure and when ownership changes.
- School or durable faculty-controlled accounts should own the domain, DNS, GitHub organization, Vercel, Supabase, Google OAuth project, billing, and recovery channels.
- Application administrator status does not grant those infrastructure permissions.

## Logging and audit

Record authentication failures, membership changes, permission failures, publication transitions, homepage-selection changes, archive/restore/delete actions, suspicious uploads, configuration changes, and operational failures.

Never log passwords, OAuth tokens, session cookies, secret keys, complete request headers, or unnecessary personal data. Audit records identify actor, action, resource, timestamp, and safe change metadata.

## Incident preparation

- Preserve evidence and relevant logs before altering a suspected compromised environment.
- Maintain credential-rotation, rollback, and clean-restore procedures.
- Test database restoration before launch and periodically afterward.
- Define technical and faculty escalation contacts before production.
- Legacy WordPress plugins, themes, executables, users, passwords, and configuration must not be migrated.

## Verification

Required permission, content-safety, upload, session, caching, and recovery checks are defined in `testing.md`. Use OWASP ASVS as the application-security verification baseline during implementation and pre-launch review.

## Accepted Phase 3 write extension

[ADR 0007](decisions/0007-private-draft-editor-and-mutations.md) accepts two narrow authenticated draft mutation functions with explicit database identity/profile/membership, owner/admin, status and content checks. Direct table writes remain closed. The [contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md) requires private receipt/quota state, authorization rechecks after waits and atomic content/history/receipt capture; quota bookkeeping may survive an ordinary failed business operation. Create/save controls are implemented and tested below; application queries/actions are implemented below and editor UI remains planned. Existing direct table grants and policies remain unchanged.

## Implemented Phase 3 validation boundary

Task 2 implements only the [draft input validators](api-contracts.md#implemented-draft-input-validation). The four private SQL functions are immutable invokers with an empty search path and explicit PUBLIC/anon/authenticated EXECUTE revocations. They access no tables. They do not bypass RLS, grant application validation access, enforce membership themselves or expose create/save RPCs. All existing table and role/ownership denials remain in effect; future mutation functions must invoke these checks and independently enforce identity, authority, active references and quotas.

Shared adversarial fixtures exercise exact keys/types, document parent grammar, unsafe links/attributes, Unicode and size/depth/node bounds, duplicate selections and canonicalization against both TypeScript and the real local database. Grant catalog assertions and actual anonymous/authenticated invocation denials cover the helper boundary. Existing privileged content fixtures remain unchanged; adding a validator does not retroactively validate stored rows or make arbitrary JSON safe to render.

Internationalized-domain support is deferred by owner decision; the [authoritative link contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md#draft-payload-and-content) excludes unchecked punycode host labels. This resolves the SQL/browser discrepancy found during independent Task 2 review without adding a dependency or weakening either validation boundary.

## Implemented Phase 3 draft creation

The [create RPC](api-contracts.md#implemented-draft-creation) is the only new application write entry point. It is a fixed-search-path security-definer boundary; its five guard helpers and snapshot helper remain private invokers without application execution. Auth identity, membership and owner-profile SHARE locks preserve eligibility through commit; selected reference locks prevent activation/parent changes during capture. Post-wait checks and actor quota serialization are exercised with independent authenticated sessions.

All article/association/history direct writes remain denied, including administrators. Eligible callers receive one self-owned draft with internally derived actor/history; credit grants no authority. Exact successful authorized retries are free; other eligible attempts consume the fixed quota. A guarded business subtransaction covers article/links/revision/audit/receipt together. SQL diagnostics remain private, with only SQLSTATE/request ID logged. No hosted credentials, new services or dependencies are introduced. Save/lifecycle/reassignment/restore and editor UI are not enabled; existing human/pre-launch review requirements remain separate.

## Implemented Phase 3 draft saving

The [save RPC](api-contracts.md#implemented-versioned-draft-saving) is the second and final accepted draft mutation signature. Its fixed-search-path definer body uses the existing caller locks/quota, then locks only an owner/admin-authorized target and observes current status, stored format and version after waits. Anonymous execution is revoked; direct table/history writes remain closed. Current authorization is checked even for exact replay; mismatched completed request IDs are rejected. No owner/lifecycle field is accepted.

References are locked and validated before no-op/change decisions, so inactive selections must be deliberately removed/replaced even for administrators. New writes to published/archived or unsupported bodies are blocked. All association removals, field/version updates, insertions, revision/audit capture and receipt writes share a rollback boundary; quota remains outside it. Independent sessions prove owner/admin conflict handling, replay safety and post-wait caller/reference/status/version/body checks. No new client credentials, grants beyond this signature, services or dependencies are introduced. Editor/safe rendering, application actions, hosted configuration and separate human/pre-launch review remain later work.

## Implemented Phase 4 published editing

Task 5 adds a separate authenticated `save_published_article` RPC; the draft RPC still rejects published rows. The trusted database boundary checks eligible active identity, owner or administrator authority, published status, expected version, supported stored body and publication readiness. Direct article/history writes remain closed. Credits alone grant no authority. Changed edits cannot alter slug, owner, status or publication time; they commit article fields, associations, body-image references, revision, audit and receipt together. Archived rows remain read-only. The dashboard hides draft-only image mutation controls on published articles; uploads and main-image changes still require their separate draft-scoped operations. Public reading remains unavailable. Human security review remains required.

## Implemented Phase 4 owner article lifecycle

Task 6 adds separate authenticated publish/archive RPCs with active owner or administrator checks, strict version/status checks, actor and article locks, exact receipts, and atomic revision/audit capture. Publish reuses locked readiness checks; archive can remove invalid old published content from circulation. Direct status writes and anonymous execution remain closed. The dashboard checks for unsaved local work before invoking the RPC; the database independently rejects stale or unauthorized requests. No public article read, restore, deletion, or scheduling grant is added.

## Implemented administrator article management and restore

Task 7 adds an administrator-only restore operation to the same checked transition helper. Its database boundary checks active eligibility and administrator role before article selection, then archived status/version and locked publication readiness. Direct article writes remain closed; anonymous users cannot execute the RPC. Admin list and detail routes, plus their query functions, independently check the active role and return only safe summaries. My Articles remains owner-filtered. A forged cursor, status, search or UUID cannot grant access or return article bodies. Exact restore retries retain the original request after uncertainty; failed and unauthorized attempts add no revision, audit or receipt. Public article reads and archive repair remain future work.

Task 8 adds a bounded, read-only article audit RPC. It checks `private.is_active_administrator()` inside a fixed-search-path security-definer function and grants execution only to authenticated callers; route and server query add independent active-role guards. The RPC returns a safe profile label rather than the private actor Auth ID, excludes correlation IDs and all body/history payloads, and rejects unimplemented actions and oversized direct calls. Existing audit RLS and all write denials remain in place. Event rows survive article archival and are not coupled to current article visibility.

## Implemented private server draft boundary

Task 5 uses the existing verified access lookup and cookie-scoped publishable-key client for every query/action; database grants, RLS and mutation guards remain the final authority. All server Supabase requests force no-store. Own-list filtering includes administrators, detail reads retain existing administrator authority, and catalogs explicitly restrict active choices. Stored unsupported bodies never enter editable results; unavailable selections expose IDs rather than fetching privileged labels. Strict action envelopes/results and safe read errors prevent protected-field forwarding or raw SQL/body responses. Only private paths are revalidated. See the [interface details](api-contracts.md#implemented-private-draft-server-boundary) and [verification limits](testing.md#phase-3-task-5-server-queryaction-boundary).

No schema/grant, auth model, dependency, audit exception, public projection, editor rendering or lifecycle capability changed. The global server-action transport cap is 4 MiB while canonical database bounds remain unchanged. Human security review remains required; unit/SQL tests and agent review do not substitute for it.

## Implemented My Articles surface

Task 6 exposes only the existing caller-owned summary query through `/dashboard`. Layout/page/query guards remain independent, administrators' My Articles stays owner-filtered, and a cursor cannot select another owner. Draft text renders as React text; no body, excerpt or privileged labels enter list results. Draft-only edit links imply no authority and existing published/archived rows expose no edit control. Safe server read recovery rethrows Next control-flow exceptions, preserving auth redirects. Browser checks cover signed-out/ineligible access, cross-owner cursors for authors/admins, no-store responses and recovery without JavaScript; see [evidence](testing.md#phase-3-task-6-my-articles-listing). No grants, RPC, auth model or lifecycle operation changed.

## Implemented new-draft submission surface

Task 7 uses existing verified query/action guards and controlled RPCs; client fields never supply owner, actor, status or history. Required metadata validation/feedback shares the existing validator. Phase 4 Task 2 removes the slug input and allocates collisions inside the database. No active section means no enabled create action. Without JavaScript the form explains its dependency and stays disabled; no default GET submission of draft values is enabled.

Pending/uncertain commands are kept in memory only and reuse their UUID/payload/version. Task 10 allows newer edits without changing those commands. Once uncertain, a subsequent forbidden response does not prove the original write failed; the same command remains pending until confirmed success. Real browser checks cover committed-but-lost responses, access revocation/restoration, exact replay and single history capture, plus malformed action encoding/protected-field rejection. No service-role client, direct table grant, dependency, schema, publishing or upload capability changed. Human security and screen-reader review remain separate requirements.

## Implemented constrained private body editor

Phase 4 Task 4 extends this editor with version 2 image nodes. The stored body accepts only a finalized same-article asset ID and bounded plain-text alt/caption fields; it does not accept a source URL or executable embed. A relational current-reference table and retained revision references protect media from cleanup. The private preview route requires active access and RLS-scoped media read, returns WebP with no-store/nosniff headers, and does not use the privileged media client. Video remains gated until the owner approves providers.

Task 8 enables only the reviewed node/mark schema, validates stored canonical input before engine loading, verifies fixed native defaults and rejects meaningful unsupported attributes. Editor output still passes the existing strict action and authoritative database validators; no auth model, RLS/grant, lifecycle, media or public projection changes. Unsupported legacy content and read-only statuses remain preserved, including for administrators.

Clipboard interception happens before Tiptap's parser. Only plain text is accepted; line/node allocation is bounded before model construction, and the prospective whole document validates before dispatch. HTML/files/other rich formats and drops are explicitly rejected. Links reuse the accepted URL validator, have application-fixed target/rel, disable automatic linking/click navigation and fetch no previews. Body errors block saves, expose accessible associations and preserve best-effort native unload warnings, including native edits not present in the controller's last valid body.

The former CI advisory exception is retired after upstream withdrawal; production/full audits are unfiltered and clean. Human rich-content/security and screen-reader review remain outstanding; automated/agent review does not substitute. Task 10 supplies supported app-link/sign-out protection and save/conflict reconciliation; no autosave or persistent recovery is claimed.

## Implemented draft association selection surface

Task 9 selects only existing eligible catalog IDs and never grants contributor edit authority. The category-read action independently guards active membership, validates its section UUID and restricts active categories/parents even for administrators. Hidden labels are not fetched for unavailable references. New selections pass client usability checks and the existing strict action/RPC validators; references deactivated after loading still fail at the authoritative mutation boundary with input retained. Direct writes, ownership, authentication, schema and grants remain unchanged.

Section changes retain categories until deliberate removal/replacement. Stale category responses cannot replace current choices, failed reads expose retry, and pending/uncertain writes retain their original retry payload/version while Task 10 permits newer local input. The category read action checks current access without redirecting; denial/unavailability returns safe feedback and does not discard mounted editor input. No new private draft persistence or logging is added. Human security/screen-reader review remains outstanding.

## Implemented Task 10 recovery and leave checks

Latest-snapshot review is a read-only, active-access-checked server action built on the existing private detail/catalog queries. Anonymous/ineligible callers receive safe denial, and credited non-owners receive the same missing result as other unauthorized readers. Failures disclose no private body or SQL details and preserve the mounted editor. Read-only/unsupported/hidden results cannot be adopted as editable data; deliberate loads still leave all later writes version-checked by the existing RPC.

Editable-in-flight state never changes the submitted command's ownership, payload, UUID or expected version. Lost-response retries remain exact after newer invalid native text or access loss; a response can acknowledge only its own snapshot. No global/private persistent draft store, service credential, grant or schema change is added. Recovery previews render safe text, and unsupported native body edits are discarded only through explicit replacement/leave confirmation, with the last-valid-reference limitation stated.

The navigation provider contains only a leave-check callback. Canceling sign-out prevents its request before the unchanged server action runs; clean and no-JS form behavior stay server-owned. Supported app links are guarded, new tabs/hash anchors remain usable, and full-document reload/close warnings are best-effort. Same-document history interception, crash recovery, hosted provider/session assurance and human screen-reader/security review remain separate limitations.

## Administrator site information

Task 14 closes direct application access to site settings and receipts. A user-scoped server client calls checked RPCs that derive the actor from Auth, require eligible active administrator membership and an active profile, and serialize with membership and profile operations. Updates validate named fields, reject markup and unsafe social URLs, prevent lost writes with versions, preserve exact retries, and audit without copying settings text. Public access remains Phase 5 work.
