# Phase 5 Task 9 — public homepage composition

Status: implemented and locally verified on `feat/public-homepage-query`, based on Task 8 PR #57. Target main; merge prerequisites #56/#57 first.

## Acceptance and design risks

- Resolve one lead, four Featured News and four Read This using saved order and newest published fallbacks. Reserve every valid saved pick before fallback, deduplicate across curated slots, preserve UTC timestamp/UUID ordering and expose no saved/private selections or admin versions.
- Latest returns the three newest public stories excluding the lead, matching demo home.js. It may overlap lower curated groups. Section rows contain four latest public stories, may repeat curated stories, and include at most 100 active sections (same navigation cap); overflow fails unavailable instead of truncating.
- One anonymous, fixed-search-path STABLE RPC observes a coherent statement snapshot. Cards contain only the checked summary contract; active section/profile and finalized current main-image rules apply. No bodies, Auth IDs, receipts, private curation or object keys leak. Bad required data fails safely.
- Narrowly extract a private slot resolver reused by admin effective preview and public composition; preserve admin saved-state/version shape and valid selection behavior. Handle malformed legacy repeated/oversized picks with bounded effective slots.
- Fetch at most one bounded batch of unique card metadata, with an upper bound of 412 references before deduplication (nine curated, three Latest, four per 100 sections). Use existing publication/section indexes; no new index without query-plan evidence.
- Reuse the no-cookie/no-store client and card validation. Strict schema validation checks slot bounds, cross-slot duplicates and section relationships. No homepage UI changes until Task 10.

## Steps and proof

1. Focused failing SQL and adapter tests for empty/sparse catalogs, saved picks, fallback reservation/order, ties, private/archive/malformed selections, parity and card privacy.
2. Add the resolver, bounded batch-card projection and public composition RPC; exercise existing administrator curation tests unchanged.
3. Share backend card validation between list/homepage readers; add strict result validation and regenerate database types.
4. Review once; run relevant SQL, concurrency, adapter/type/lint/schema/type checks and clean-install proof. Record query-plan evidence, update authoritative API/security docs and status, commit focused changes and open a main-targeting draft PR.

## Verification evidence

- Focused SQL: 28 homepage assertions plus 37 existing administrator curation assertions passed. The full clean-install database suite passed 1,715 assertions. Minor schema-lint cleanup followed; affected SQL tests and lint passed afterward without warnings.
- Tests cover empty/single-story catalogs, saved pick reservation, deterministic timestamp/UUID ties, archive fallback, slot duplicate constraints, inactive required owners, exact 100-section/412-reference capacity, overflow, role parity and private fields/ACL denials.
- Independent sessions on the disposable database confirmed the prior committed lead remains visible during an uncommitted archive, fallback appears after commit, and restore reinstates the saved lead on the next statement.
- A rollback-only sample of 5,000 articles across eight sections composed the homepage in approximately 11 ms locally. Section top-four scans used the existing publication index and stopped after four matches; no new index was justified. This sample does not establish production-scale capacity.
- One focused review found no actionable defects. Runtime card validation was extracted without changing its rules; existing listing tests passed. The initial duplicate-fixture insert was rejected by an existing uniqueness constraint, so the test now verifies that denial rather than bypassing the schema.
- Fourteen focused homepage/list/admin unit tests passed. Production build, schema lint, generated-type drift, TypeScript, lint and formatting passed. No UI route or authorization model changed; no browser screenshots were required. Human maintainer review and hosted capacity verification remain outstanding.
- Rollback can restore the prior application without changing stored selections. Retain the additive helpers while the administrator reader depends on them; restore its old definition before removing helpers. No data migration or destructive rollback is required.
