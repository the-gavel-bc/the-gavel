# Phase 5 Task 10 — public homepage UI

Status: implemented and verified locally on `feat/public-homepage-ui`, based on Task 9 PR #58. Target main; merge prerequisites #56–#58 first.

## Design and acceptance

- Assemble the approved public query into an editorial hero, three-story Latest column, Featured News band and active-section rows using shared cards. Render only actual returned stories; omit empty groups, use a full-width hero when Latest is empty, and support a text-only lead without media.
- The homepage has one publication h1; hero/Latest/section titles use h2 and subordinate cards h3. Native article/section/author links and the existing public image route remain usable without JavaScript.
- Hero media has intrinsic dimensions, meaningful alt/credit and eager loading; lower cards retain lazy loading. Reuse reader tokens and responsive grids with long-title wrapping and visible focus. No external branding/font/image assets are added.
- Share a React request-scoped cached query between the public layout's Read This slot and page content. This is deduplication within one render, not persistent or cross-request caching; a new request after curation/edit/archive/restore gets fresh data. Existing cookie-free/no-store authorization remains authoritative.
- Distinguish unavailable service, no published stories, a single story and partial groups. Errors/empty states do not invent placeholder stories. Homepage content queries are not repeated per card.
- Reader shell/auth composition and protected layouts stay unchanged. Exact screenshot reconciliation and branding approval remain later gates.

## Verification

1. Focused failing page/layout/component tests for data states, links, hero image priority, empty groups and footer Read This.
2. Implement the four small homepage components, route composition and request-scoped query reuse; run relevant unit/type/lint/format checks.
3. Review once; use real production/browser fixtures for desktop/mobile/no-JS layouts and curation/edit/archive/restore freshness. Keep synthetic content out of committed application routes and roll back or remove fixtures.
4. Update component/design docs and status, run production build, make coherent commits and open a main-targeting draft PR with prerequisites explicit.

## Verification evidence

- Full unit suite passed 696 tests, including eleven focused page/layout/query cases. One focused review found that a null lead can coexist with reserved published stories; the page now renders groups independently, with a regression test and actual-browser proof.
- Built production app against a disposable Supabase stack. Chromium passed 320/768/1440px populated layouts, no horizontal overflow, decoded eager hero media, footer Read This parity and mobile no-JavaScript rendering. A temporary fetch counter confirmed exactly one homepage RPC per page render across metadata/body/footer; no probe was committed.
- Checked administrator curation, published-save, archive and restore RPCs changed the next homepage request. The archived headline disappeared and fallback replaced it; restore reinstated the saved lead. Root HTML was no-store.
- Separate browser cases passed a reserved-only catalog without a lead, single text-only hero, and actual unavailable RPC with retry feedback/noindex and no fabricated footer picks. The failure metadata reuses the same request-scoped query; it adds no persistent cache.
- Production build, TypeScript, lint and formatting passed. No schema/authorization change was made; database suites were not repeated. Synthetic stories/images were limited to a disposable stack, which was removed, and the temporary server was stopped.
- Screenshot matching, branding provenance and human screen-reader/visual approval remain outstanding. Article/search/archive destination implementations remain in their owning later tasks.
