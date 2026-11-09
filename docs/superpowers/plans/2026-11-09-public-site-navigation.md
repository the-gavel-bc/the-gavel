# Phase 5 Task 4 — public navigation and site information

Status: implemented on `feat/public-site-navigation`, stacked on Task 3 PR #52. The [reader contract](2026-11-09-phase-five-reader-contract.md) specifies public visibility and approved fields. Rendering and public pages are later tasks.

## Acceptance and design risks

- A single fixed-search-path, security-definer RPC returns active sections and active categories under active parents, ordered by configured navigation order with deterministic ties. Anonymous and authenticated results are identical; existing direct taxonomy and private settings grants remain unchanged.
- Return only mission, contact email, Instagram URL and submission instructions. Unset or malformed stored fields become null, never raw markup or unsafe links. No private settings IDs, edit versions, audit rows or receipts are exposed.
- Bound the response to 100 active sections and 1,000 active categories across them. Check one extra row and return generic unavailable on overflow instead of silently truncating navigation. These operational guardrails are not taxonomy write limits.
- Obtain settings and navigation in one statement snapshot; return coherent data without persistent caching. Use the existing server-only publishable-key client with no cookies or service credentials and strictly validate every field.
- Empty settings and catalogs are valid; no demo copy or fabricated navigation appears. Reader routes, visual changes and admin write changes are out of scope.

## Steps and validation

1. Add failing SQL tests for direct-role parity, active parent/child filtering, ordering, empty/unset state, unsafe persisted links, overflow and direct settings denials.
2. Add the bounded allowlist RPC and generated types; run focused database checks and inspect relevant query paths.
3. Add the checked server adapter and focused tests for strict response validation, invalid links, errors and empty data. Run type, lint and unit checks.
4. Review once, then run relevant database/schema/type checks and clean-install proof. Update API/security documentation and status; make coherent commits and open a draft PR stacked on #52. Owner watches hosted CI.

## Verification and decisions

- Full local database regression suite passed 1,668 assertions, including 30 focused checks for role parity, inactive taxonomy, limits, missing settings and malformed values. A disposable clean-install database also passed all 30 focused checks. Schema lint, generated-type drift, TypeScript, lint, formatting and production build passed.
- `pnpm exec vitest run --maxWorkers=2` passed all 665 unit tests; worker count avoids the previously observed local load-related timeout.
- A rollback-only query plan with 1,000 synthetic categories scanned and sorted the sample in under a millisecond locally; no additional index was justified by that sample. This is not a production-scale performance guarantee.
- Review found the existing editor email pattern accepts malformed addresses. The public SQL and adapter now reject repeated local-part dots and malformed domain labels. The editor's write validation remains unchanged, so malformed addresses accepted there are hidden publicly until corrected.
- Human maintainer review remains required for public authorization and migration changes.
