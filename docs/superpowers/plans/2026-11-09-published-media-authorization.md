# Phase 5 Task 5 — published-media authorization

Status: database authorization and maintenance backfill implemented; verified locally; PR preparation in progress on `feat/published-media-authorization`, stacked on Task 4 PR #53 at `b219ae8`. The owner separately approved the verified maintenance backfill. Public delivery caching is implemented by Task 6; this task keeps upstream Storage responses no-store.

## Requirements and risks

Only finalized assets currently referenced by a published article's main image or canonical current body may be read publicly. Draft, archived, deleting, unattached and revision-only assets remain private. Listing, mutation, metadata enumeration and existing private preview permissions remain unchanged. Origin requests must recheck publication. The owner accepts cached published images remaining available for up to 300 seconds after archive, deletion or removal of their live reference. Private images and errors remain no-store; already delivered bytes and in-flight requests cannot be recalled.

## Investigated evidence

On 2026-11-09, local Storage API v1.82.1 was tested through the real HTTP endpoint with an isolated synthetic WebP, an exact-key temporary anonymous read policy, and conditional requests. The temporary policy and object were removed afterward.

- Current upload options (SDK default cache lifetime): anonymous GET returned 200 with `Cache-Control: max-age=3600`. After policy removal, conditional GET returned 400 rather than 304.
- Upload with the supported SDK `headers: { "cache-control": "no-store" }` override: anonymous GET returned 200 with `Cache-Control: no-store`. After policy removal, conditional GET returned 400.
- Fresh local origin requests enforce authorization, but existing objects can remain fresh in browser or intermediary caches for an hour. This violates the accepted initial no-cache contract. Local evidence does not prove hosted CDN behavior.

## Approved policy and compatibility work

The owner approved five-minute caching for published images on 2026-11-09, prioritizing reader performance. The [reader contract](2026-11-09-phase-five-reader-contract.md#media-responses-and-metadata) is authoritative for cache behavior. This supersedes the earlier no-store proposal for successful public image responses; article pages and private responses retain fresh checks.

1. Set explicit 300-second freshness for eligible published-image delivery and require revalidation after expiry. Test browser/intermediary behavior and ensure upstream and proxy caches do not compound or restart the five-minute lifetime.
2. Keep private uploads/previews and errors no-store. Verify the Storage API can produce the distinct public/private response policies safely before selecting the header implementation.
3. Existing objects currently return max-age=3600. Before public grants, choose and verify a Storage-API migration or another compatible delivery strategy. Direct PostgreSQL metadata edits alone do not prove backend headers changed.
4. If an operator backfill is needed, it must be bounded and resumable, verify identical bytes against stored SHA-256, preserve failures for retry, and avoid racing finalization, cleanup or lifecycle changes. A documented maintenance window is an option. Service-key scope expansion still needs separate approval; the caching decision does not grant it.
5. Previously cached responses cannot be recalled. Account for old cache expiry or verified invalidation during rollout. No new CDN or purge service is approved in this slice.

## Remaining implementation

- Add a fixed-search-path visibility helper that checks article publication, same-article finalized assets and current main/body references. Keep helper grants minimal and allow only necessary Storage GET operations.
- Prove direct anon/authenticated denials for every nonpublic state, metadata/list operations, cross-article substitution, and removed body images retained only in history.
- Test archive/restore and reference changes with independent sessions; verify actual Storage HTTP/conditional requests and headers.
- Run focused SQL and upload tests, schema/type checks and clean-install proof; review once, update authoritative security/API docs, and open a draft PR. Task 6 implements the app delivery route.

## Maintenance procedure

The owner approved the one-time service-role backfill on 2026-11-09. Run only with application writers, scheduled cleanup and administrator cleanup stopped; wait for every in-flight upload, finalization, lifecycle mutation and cleanup request to finish. The command flag is operator acknowledgement, not a distributed lock. Keep maintenance active until verification completes.

Use Node 22 with the intended environment file (never commit its credentials):

```sh
node --env-file=.env.local scripts/media-cache-backfill/media-cache-backfill.mjs --confirm-maintenance --limit 25
```

Each bounded batch prints asset IDs and a resume cursor. Continue with `--after <resumeAfter>` while `morePossible` is true. On failure, stop and investigate; resume from the reported cursor to retry the failed asset. Successful retries verify bytes/headers and skip rewrites. The command checks a private bucket and canonical paths, verifies SHA-256 before/after every rewrite, and fails on changed rows or headers. It never prints object bodies or keys. Do not resume normal operations with unresolved failures for images required for publication.

Existing no-store objects pass the policy only when finalized and currently referenced by a published article. Legacy one-hour objects remain denied to public callers until migrated. A failed rewrite never expands access. Prior cached one-hour responses cannot be recalled; allow expiry or verified invalidation before claiming the new five-minute removal guarantee. Hosted header/CDN checks and human maintainer review remain release gates. Rollback drops the new policy/function and reverts application code; no-store objects remain safe and do not need a destructive rollback.

## Verification evidence

- Focused upload/backfill tests: 12 passed. TypeScript, lint, schema lint and generated-type drift passed.
- Clean-install full database suite: 1,681 assertions passed, including 13 focused media policy cases. The same focused SQL cases passed against the upgraded local database.
- Actual Storage API v1.82.1 test on a disposable stack: legacy cached object denied; identical-byte hash-verified backfill succeeded; retry verified without rewriting; anonymous live GET returned 200 with no-store; archive returned denial; restore returned 200; reference removal returned denial.
- Independent-session transaction test: an in-progress archive permitted the prior committed publication snapshot, then the next Storage request after commit was denied. Already in-flight responses remain outside recall guarantees.
- One focused security review found no actionable issues. The operator must stop and drain all writers/cleanup before backfill; the maintenance flag alone does not enforce this.
- No hosted backfill was run. Hosted Storage/CDN verification and human maintainer review remain outstanding. Task 6 public route caching remains separate work.
