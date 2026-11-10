# Phase 5 Task 20 — public metadata and canonical identity

> **For agentic workers:** Use superpowers:executing-plans for the approved slice. Keep decisions and evidence here.

**Goal:** Emit safe current public titles, descriptions, canonical URLs and social previews in initial HTML while excluding private/error/search variants from indexing.

**Architecture:** A server-only metadata formatter consumes existing checked public DTOs; it performs no database reads. Routes retain their request-cached anonymous readers, status handling and frozen source slugs. Absolute URLs use validated SITE_URL only. No metadata-specific RPC, persistent cache or service is needed.

**Spec/stack:** [Task 20](2026-11-09-phase-five-public-reader.md#task-20--public-page-metadata-and-canonical-identity), [reader contract](2026-11-09-phase-five-reader-contract.md#media-responses-and-metadata); existing Next.js/React/TypeScript/Supabase/Vitest/Playwright.

## Baseline and decisions

Branch `feat/public-page-metadata` reuses `/private/tmp/the-gavel-phase5-task17`, starting at Task 19 `e8da9ca`. Main `711228a`; #65–#68 remain prerequisites while open. Primary checkout, user screenshots and working database remain untouched.

Reuse full checked public reads rather than adding a permissive metadata reader or private fallback. Per-request React cache already shares these reads between layout, page and metadata. Only current public descriptors may supply social images; absent images remain absent. No generated logo/card, provider or author image is invented.

Use Next's supported `htmlLimitedBots: /.*/` configuration to keep metadata in the initial head for all user agents, including no-JavaScript readers. This waits for the existing public read before flushing metadata; it adds no query or cache. It does not patch the framework or solve Task 18's owner-approved matched-resource 404 initial-body release blocker. See [metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) and [blocking metadata setting](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots).

## Acceptance and design risks

- Root metadataBase uses validated SITE_URL, never Host/forwarded headers. Root has only safe site defaults, without a canonical/social image that could bleed into private/error routes. Canonical paths are an explicit allowlist of existing public route shapes, with strict canonical slugs. Reject external, query/hash, encoded traversal, unknown/private/API paths rather than silently normalizing them.
- Indexable first pages: homepage, published article, active section/category/tag/author/letters archive, and informational pages with primary approved copy. Use stored article/profile slugs and section-scoped categories. Ignore tracking/query noise for canonical identity. Valid cursor continuations are noindex/follow, with no canonical/social preview; invalid cursor, unavailable and unset primary copy are noindex/nofollow. Search/auth/dashboard remain noindex/nofollow. No public URL or lifecycle rule changes.
- Plain text remains escaped by Next; normalize controls/whitespace and bound descriptions to 320 Unicode code points. Article description prefers nonempty meta description then excerpt then the existing site default; never derive a snippet from body/revisions/SEO keyphrase. Author biography and configured mission/instructions may supply bounded plain descriptions. No HTML parsing, unsafe raw output, revision lookup or draft preview.
- Social cards use canonical SITE_URL links, branded titles, checked main-image descriptors and authorized public media paths only. Website vs article types, published timestamp and public writer/owner URLs are explicit; no Auth IDs, storage keys, service credentials or private image fallback. Missing image uses a text summary card. Errors clear social/canonical output.
- Preserve anonymous/signed-in public parity, private access checks and no-store reads. Archive/delete must remove metadata on the next request; in-flight responses and approved five-minute image caches retain their existing limits. Legacy invalid bodies stay unavailable/noindex. No role/grant/SQL change or cross-request metadata cache.
- Add robots metadata to dashboard/auth pages and X-Robots-Tag headers for private/auth/search/internal/private-media route families, including redirects and non-HTML responses. This supplements authorization; it never grants access. Leave public image indexing/cache behavior unchanged.
- Test actual initial head/headers, hostile origin hints, malformed canonical paths, absent media, duplicate-read avoidance, publication edits/archive/restore/delete and signed-in requests. Retain the existing framework 404 blocker; do not remove its expected-failure assertion or claim complete no-JavaScript recovery.

## File map and execution

1. `src/backend/reader/public-metadata/`: formatters for allowed public pages, articles and archive states, with focused tests. No infrastructure/client access except validated server origin.
   - [x] Write failing tests for canonical allowlist, escaping/plain descriptions, public media URLs, author links, no-image cards and excluded states. Implement minimal formatters; run tests and commit.
2. Root/public routes and auth/dashboard metadata exports; `next.config.ts` for head timing and private response robots headers.
   - [x] Update metadata tests to assert additional fields without weakening existing not-found/permission behavior. Keep page bodies/read boundaries unchanged; run affected tests and configuration checks.
   - [x] Wire homepage/article/archives/authors/information to existing reads and helpers. Preserve search's static metadata so metadata never spends a search ticket. Commit coherent route groups.
3. `e2e/public-metadata/`: production desktop/mobile initial-head/header checks, with disposable fixture-only lifecycle/source changes and restored rows/settings. Do not mutate the working database.
   - [x] Run relevant fast checks before the heavy browser/build run. Verify changed publication state and signed-in parity, canonical/image safety, missing/invalid/private exclusions and real head presence. No full SQL/concurrency rerun for unchanged readers/grants.
   - [x] Review once; update authoritative metadata/architecture/security notes only for lasting rules, this plan, phase checklist and STATUS. Small commits, draft PR explicitly targeting main with dependencies. Owner watches CI. Stop before Task 21.

## Verification record

Implemented. SITE_URL production configuration, preview protection, human review, upstream resource-404 recovery and other existing launch gates remain explicit.


- Baseline passed 16 existing public-reader/article/information tests. New formatter and route/config tests failed before implementation, then passed. The final implementation passed all 813 unit/component tests across 128 files with `pnpm exec vitest run --maxWorkers=2`. Metadata tests were then split by formatter concern without changing assertions; targeted rerun passed all 26 cases across three files. Final types, lint, configured formatting and diff checks passed. No full SQL/concurrency suite or generated-type tooling was repeated: schema, grants and existing readers are unchanged.
- `METADATA_BROWSER_WORKDIR=/private/tmp/gavel-task20-browser pnpm exec playwright test --config playwright.task20.config.ts` built the production app and passed six desktop/mobile metadata journeys. These check real initial-head canonical/OG/Twitter/description tags without JavaScript, authorized main-image delivery (HTTP 200), text-only fallback, section-scoped category/tag/author URLs, continuation/invalid noindex, trusted origin despite forged Host/forwarded headers, and private/auth/search/internal robots headers including redirects. A valid synthetic owner was confirmed through dashboard HTTP 200 before asserting private/archive metadata denial; legacy NULL bodies remained unavailable/noindex. Fresh published title edits retained the stored canonical; archive/delete removed canonical/social metadata on the next request and restore exposed current metadata again.
- The initial RPC-count assertion matched both `get_public_article` and the separate `get_public_article_media` call. Inspection of normalized pg_stat_statements queries proved that instrumentation error. The corrected exact function match passed desktop/mobile with `--grep 'exactly one'`, reusing the unchanged production build: one article RPC serves both page and metadata. These two successful targeted cases plus the six earlier journeys give eight positive browser cases across runs; no clean full-browser invocation is claimed.
- Early reruns also exposed retained synthetic media-key/cleanup ledger rows. The fixture now removes only its exact records in dependency order, and setup errors attempt cleanup. A scoped post-run query confirmed zero synthetic articles, media-key records and Storage objects. Earlier instrument/fixture failures are not reported as passing application checks; no count/status/privacy assertion was relaxed.
- A final raw-HTML probe confirmed empty-home canonical identity, unset About noindex and unchanged missing-resource HTTP 404/noindex with no canonical. The 404 initial body still lacks main content, so the existing owner-approved Task 18 release blocker is preserved. The supported metadata-head setting is not represented as a recovery fix or dependency patch.
- One fresh read-only agent review found no actionable issues; it ran no suites. No UI screenshots were needed. Production/preview origin and cache/header checks, human security/visual/screen-reader review, unresolved content/assets and the upstream recovery blocker remain release gates. Owner monitors hosted CI.

The disposable project used current migrations under `/private/tmp/gavel-task20-browser` (API57321/DB57322), one worker and synthetic fixtures only. Its temporary Playwright configuration is local tooling, not application code. Standard CI runs `pnpm exec playwright test e2e/public-metadata`; exact global statement counting is declared only for the dedicated scratch run. Root/default social metadata is deliberately absent; every indexable page supplies its own checked identity. Descriptions are capped at 320 Unicode code points in the formatter; SQL remains the sole content/visibility authority.
