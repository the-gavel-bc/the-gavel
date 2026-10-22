# Security and permissions

Status: Foundation access/session controls and Phase 2 content/history read permissions implemented; publishing and hosted provider controls remain planned.

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
- Active members can update their own editable profile fields; active administrators may update these fields across profiles. Inactive members cannot edit profiles.
- Authenticated users can read only their own membership unless they hold an active administrator membership.
- Active administrators can manage membership rows through narrow RLS policies backed by a fixed-search-path security-definer predicate.
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

The authorization matrix above describes the final MVP. Its taxonomy-management permissions and public article reads remain future workflows. Task 2 introduces no management UI, public route, or mutation RPC; article storage is described below. Migration constraints and the [accepted contract](superpowers/specs/2026-10-21-content-foundation-design.md) define the stored taxonomy boundary; [testing coverage](testing.md#implemented-taxonomy-coverage) proves direct reads and write denials.

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

- Validate all request bodies, query parameters, identifiers, slugs, dates, URLs, and pagination limits.
- Store structured content or a constrained rich-text representation.
- Sanitize rich content on the trusted server boundary.
- Reject arbitrary HTML, scripts, styles, event handlers, objects, forms, and unapproved iframes.
- Permit video embeds only from an explicit provider allowlist.
- Encode untrusted text for its output context.
- Validate redirect targets and allow only intended local or approved external destinations.

## Upload controls

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

[ADR 0007](decisions/0007-private-draft-editor-and-mutations.md) accepts two narrow authenticated draft mutation functions with explicit database identity/profile/membership, owner/admin, status and content checks. Direct table writes remain closed. The [contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md) requires private receipt/quota state, authorization rechecks after waits and atomic content/history/receipt capture; quota bookkeeping may survive an ordinary failed business operation. Create-time controls are implemented and tested below; save remains planned. Existing direct table grants and policies remain unchanged.

## Implemented Phase 3 validation boundary

Task 2 implements only the [draft input validators](api-contracts.md#implemented-draft-input-validation). The four private SQL functions are immutable invokers with an empty search path and explicit PUBLIC/anon/authenticated EXECUTE revocations. They access no tables. They do not bypass RLS, grant application validation access, enforce membership themselves or expose create/save RPCs. All existing table and role/ownership denials remain in effect; future mutation functions must invoke these checks and independently enforce identity, authority, active references and quotas.

Shared adversarial fixtures exercise exact keys/types, document parent grammar, unsafe links/attributes, Unicode and size/depth/node bounds, duplicate selections and canonicalization against both TypeScript and the real local database. Grant catalog assertions and actual anonymous/authenticated invocation denials cover the helper boundary. Existing privileged content fixtures remain unchanged; adding a validator does not retroactively validate stored rows or make arbitrary JSON safe to render.

Internationalized-domain support is deferred by owner decision; the [authoritative link contract](superpowers/specs/2026-10-22-private-draft-workflow-design.md#draft-payload-and-content) excludes unchecked punycode host labels. This resolves the SQL/browser discrepancy found during independent Task 2 review without adding a dependency or weakening either validation boundary.

## Implemented Phase 3 draft creation

The [create RPC](api-contracts.md#implemented-draft-creation) is the only new application write entry point. It is a fixed-search-path security-definer boundary; its five guard helpers and snapshot helper remain private invokers without application execution. Auth identity, membership and owner-profile SHARE locks preserve eligibility through commit; selected reference locks prevent activation/parent changes during capture. Post-wait checks and actor quota serialization are exercised with independent authenticated sessions.

All article/association/history direct writes remain denied, including administrators. Eligible callers receive one self-owned draft with internally derived actor/history; credit grants no authority. Exact successful authorized retries are free; other eligible attempts consume the fixed quota. A guarded business subtransaction covers article/links/revision/audit/receipt together. SQL diagnostics remain private, with only SQLSTATE/request ID logged. No hosted credentials, new services or dependencies are introduced. Save/lifecycle/reassignment/restore and editor UI are not enabled; existing human/pre-launch review requirements remain separate.
