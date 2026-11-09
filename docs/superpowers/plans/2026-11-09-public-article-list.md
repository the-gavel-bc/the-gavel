# Phase 5 Task 3 — bounded public article listings

Status: implemented on `feat/public-article-list`, stacked on Task 2 PR #51. The [reader contract](2026-11-09-phase-five-reader-contract.md) defines public visibility and pagination. Public pages, search, and image delivery are later tasks.

## Design and acceptance

- A single fixed-search-path, security-definer RPC exposes summary-only published cards for latest, section, section/category, tag, and author (owner or credited contributor). It never widens table grants or exposes article bodies, workflow data, private IDs, or storage keys. Active section/profile/category checks match public visibility; missing or inactive filters yield empty results.
- The default page is 12; requests must be 1–24. Read at most one extra row to determine continuation, order by `published_at DESC, id DESC`, preserve PostgreSQL microseconds as text, and avoid duplicate articles when a person has multiple credits or owns and is credited on the same story.
- Versioned opaque server cursors bind the complete scope and filters. Both the server and RPC reject malformed, oversized, cross-scope, invalid-timestamp, and partial cursors safely. Cursors are not authorization or a frozen snapshot; all pages recheck publication, so concurrent archive disappears and later publication can change subsequent pages.
- Fetch one page and its associations in one statement snapshot. Return only active public profile/taxonomy data and finalized current main-image descriptors; missing/invalid required dependencies fail safely. Bound response arrays and strings; no unbounded totals.
- Reuse the cookie-free, no-store public reader. Strictly validate the response and map backend errors to unavailable; use generic validation failures for bad input. Anonymous and authenticated direct calls must yield the same data.

## Steps and verification

1. Define cursor, filtering, pagination, and result schemas; add focused failing tests for malformed/cross-scope cursors, Unicode, timestamp precision, duplicate credits and status changes.
2. Add the additive RPC and SQL tests with direct-role parity, privacy denials, bounds and pagination; inspect representative query plans against existing indexes before adding indexes.
3. Add server adapter and tests; regenerate database types. Run focused unit tests and fast type/lint checks while building.
4. Review once, then run the relevant database/schema/type checks and clean-install proof. Update authoritative API/security documentation and status; commit coherent changes and open a draft PR stacked on #51. The owner watches hosted CI.

## Verification and decisions

- Focused database tests cover 27 cases, including direct anonymous and authenticated calls, invalid cursors, microsecond ordering, duplicate credits and publication or archive between pages. The full database suite passed 1,636 assertions before the review correction; its affected SQL tests passed afterward.
- A rollback-only 10,000-article query-plan sample showed a section query sorting 200 matching records. The targeted partial section/order index produced an ordered index-only scan that stopped after 25 rows. This sample is not a production-scale performance guarantee.
- Review found PostgreSQL could normalize a noncanonical cursor time such as `24:00`. The RPC now verifies canonical UTC round-tripping; a direct anonymous test covers it.
- The clean-install database also passed 26 listing cases. Schema lint, generated-type drift, TypeScript, lint, formatting and production build checks passed. Human maintainer review remains required for the public authorization and migrations.
- Full unit run: 660 passed, one existing import-boundary test timed out at 5 seconds. The affected file passed all 13 tests in isolation; the full run was not repeated.
