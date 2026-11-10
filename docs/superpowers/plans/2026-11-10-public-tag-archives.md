# Phase 5 Task 14 — topic-tag archives

Status: implementation on `feat/public-tag-archives`, based on Task 13 PR #62, still open. PR targets main; merge #62 first while it remains a prerequisite. Task 12 PR #61 is merged.

## Scope and acceptance

- Implement `/tags/[slug]` using the shared archive presentation and twelve-card public list contract. Tag pages have a grid, no section lead/category chips, and preserve each card's actual section link across sections.
- Resolve exactly one existing tag through the anonymous publishable-key client and existing tags SELECT policy. Select only name/slug, validate strict shape/Unicode bounds and matching identity, and never use cookies or a service key. Missing/malformed slugs return real 404; database/invalid response failures are generic unavailable/noindex. No tag creation, normalization, migration, or write grant.
- Existing tags have no active flag. Existing list SQL remains authoritative for published status, active section/public owner and valid tag associations; do not invent a tag activation rule. Existing catalog tags with no current public stories render empty archives, without exposing private counts.
- Extend archive context with an explicit sectionless variant. Keep section/category/letters behavior intact, including lead exclusion. Use type-only projection imports and server-only readers. Share the tag lookup/list result between metadata and page using request-local cache; HTML/data remain fresh per request.
- Preserve opaque scope-bound cursors, safe repeated/malformed/cross-tag rejection, first-page recovery and final states. Reads are live snapshots: later archive/publication may change later pages. Duplicate or multiple associations never duplicate a story; existing unique keys/EXISTS filtering remain authoritative. No new retry receipt, mutation conflict or concurrency protocol is needed.
- Native links, server rendering, keyboard focus, narrow reflow and no-JavaScript article-to-tag/pagination flows must work. Resolve missing scope before streaming, without a loading boundary. Reuse generic safe archive error/not-found boundaries. Complete SEO stays Task 20.

## Steps and validation

1. Add failing tag query/route and sectionless presentation regressions; implement the narrow reader and route using the existing archive grid. Keep focused commits and review once.
2. Run focused units, types and lint while building. Before PR, run unit suite, relevant existing SQL assertions, format and production desktop/mobile browser checks. Include multi-section tag results, duplicate/missing associations, inactive section/owner filtering, empty/missing tags, cursor isolation and no-JavaScript use.
3. Record commands/results and limits here; update authoritative interface/component docs and STATUS. Open a main-targeting draft PR; owner monitors hosted CI. Do not reset the database or retain fixtures.

Rollback: revert application readers/presentation changes; no stored data, schema or grants change. Human visual/accessibility review remains separate.
