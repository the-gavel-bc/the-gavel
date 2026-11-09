# Phase 5 Task 5 — published-media authorization

Status: compatibility decision pending on `feat/published-media-authorization`, stacked on Task 4 PR #53 at `b219ae8`. No public Storage policy or credential expansion has been applied.

## Requirements and risks

Only finalized assets currently referenced by a published article's main image or canonical current body may be read publicly. Draft, archived, deleting, unattached and revision-only assets remain private. Listing, mutation, metadata enumeration and existing private preview permissions remain unchanged. A new request must recheck publication; already delivered bytes and in-flight requests cannot be recalled.

## Investigated evidence

On 2026-11-09, local Storage API v1.82.1 was tested through the real HTTP endpoint with an isolated synthetic WebP, an exact-key temporary anonymous read policy, and conditional requests. The temporary policy and object were removed afterward.

- Current upload options (SDK default cache lifetime): anonymous GET returned 200 with `Cache-Control: max-age=3600`. After policy removal, conditional GET returned 400 rather than 304.
- Upload with the supported SDK `headers: { "cache-control": "no-store" }` override: anonymous GET returned 200 with `Cache-Control: no-store`. After policy removal, conditional GET returned 400.
- Fresh local origin requests enforce authorization, but existing objects can remain fresh in browser or intermediary caches for an hour. This violates the accepted initial no-cache contract. Local evidence does not prove hosted CDN behavior.

## Proposed compatibility decision

1. Set explicit no-store headers when finalizing new validated image uploads.
2. Gate anonymous Storage reads on both a live published reference and verified no-store object metadata. Existing cached objects remain private until migrated and verified.
3. Add an operator-run, bounded, resumable backfill for retained finalized images. Use the Storage API, not direct SQL metadata edits: changing only PostgreSQL metadata does not prove backend object headers changed. Verify stored bytes against the existing SHA-256 before rewriting the identical WebP with no-store headers; verify response headers afterward. Record failures for retry and never overwrite unexpected bytes.
4. Serialize the backfill with media finalization, cleanup and lifecycle mutations, or execute during a documented maintenance window. A live rewrite must not race cleanup or resurrect a retired object. Retain the existing cleanup ledger and do not grant new public access until verification succeeds.
5. Existing prior cached responses cannot be recalled. Previously cached URLs need cache expiry or a verified invalidation strategy before claiming immediate revocation.

Step 3 expands the service-role credential's currently approved purpose (validated finalization and cleanup). Owner approval is required before implementing it. An alternative is to keep older images private until individually re-uploaded through the normal validated workflow.

## Implementation after the decision

- Add a fixed-search-path visibility helper that checks article publication, same-article finalized assets and current main/body references. Keep helper grants minimal and allow only necessary Storage GET operations.
- Prove direct anon/authenticated denials for every nonpublic state, metadata/list operations, cross-article substitution, and removed body images retained only in history.
- Test archive/restore and reference changes with independent sessions; verify actual Storage HTTP/conditional requests and headers.
- Run focused SQL and upload tests, schema/type checks and clean-install proof; review once, update authoritative security/API docs, and open a draft PR. Task 6 implements the app delivery route.
