# Phase 5 Task 6 — public image delivery

Status: implemented and verified locally on `feat/public-media-delivery`, stacked on Task 5 PR #54.

## Acceptance and risks

- GET and HEAD at `/api/public/articles/[articleId]/media/[assetId]` validate UUIDs and use an allowlisted published-media projection plus anonymous Storage authorization. No cookie session, service key, caller URL or object path is accepted.
- Missing, private, archived and cross-article resources produce identical 404 no-store responses. Backend failure or malformed data produces generic 503 no-store. Invalid IDs also use 404.
- Successful published images use WebP/nosniff and explicit 300-second browser/shared freshness with mandatory revalidation; no stale extension or image optimizer. Origin Storage downloads use no-store and never forward conditional request headers, so a new origin response cannot reset an aged upstream cache lifetime.
- Read and validate the bounded WebP before publishing a cacheable response. This avoids caching partial or corrupt upstream streams; the maximum is the existing 10 MiB image limit. HEAD performs the same authorization and validation, returning headers without a body.
- A concurrent archive between projection and download must fail through Storage policy. Origin visibility remains fresh; already cached successful responses may survive for five minutes under the accepted contract.

## Steps and verification

1. Add focused failing SQL/route/query tests for IDs, status, cross-article access, errors, corrupt images, bounds and cache headers.
2. Add a narrow metadata RPC and a server-only anonymous query; wire GET/HEAD with no persistent server cache and unchanged private previews.
3. Run relevant SQL, unit, type, lint, schema and generated-type checks. Exercise actual app and Storage requests, including conditional requests and archive after visit.
4. Review once, update authoritative docs/status, commit focused pieces and open a draft PR stacked on #54. Hosted cache behavior and human review remain release gates.

## Verification

- Ten focused query/route tests passed. SQL projection tests passed six assertions on the upgraded database. A clean stack applied the migration, then received the reviewed checksum-field addition; the full database suite passed 1,687 assertions.
- Review identified a same-size corrupted WebP could pass envelope checks. Responses now compare downloaded bytes with the finalized SHA-256; a dedicated regression passes. The bounded buffer is intentional to avoid caching partial/corrupt streams, with a maximum 10 MiB per origin response.
- Production build, TypeScript, lint, formatting, schema lint and generated-type drift passed. After the checksum fix, affected unit tests, targeted lint/format and the production build passed again.
- Actual production server on port 3106 and disposable Storage: legacy-cache asset denied, verified image returned 200 with five-minute Cache-Control, HEAD returned identical success headers without bytes, a conditional GET still authorized and returned 200, archive returned 404/no-store, restore returned 200, and reference removal denied access. Headless Chromium decoded a synthetic one-pixel WebP from the route.
- Temporary server and disposable stack were stopped; existing images and hosted data were not changed. Hosted CDN cache expiry/revalidation, legacy-image maintenance and human maintainer review remain release gates.
