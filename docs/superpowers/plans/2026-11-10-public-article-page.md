# Phase 5 Task 12 — public article page

Status: implementation on `feat/public-article-page`, based on Task 11 PR #60. PR targets main; preceding unmerged reader tasks remain prerequisites.

## Acceptance and risks

- Resolve canonical slug through the anonymous public detail reader. Metadata and page share a request-scoped React cache, never a persistent cache or private preview. Unknown/draft/archived/deleted slugs use the same real 404 and generic page; invalid content/backend failures show unavailable/noindex without private details.
- Compose one article h1, title/dek/date, explicit owner and credited writer/editor/creative attribution, main media/credit, safe canonical body, taxonomy links and public owner biography. No editor bundle or raw HTML.
- Use authorized public media with intrinsic dimensions, eager main-image priority, body lazy media and approved five-minute image caching. Article HTML/data remain fresh on each origin request.
- Related content requests at most four same-section cards, then at most four recent cards if needed, choosing at most three unique stories excluding the current article. Related failure is isolated from the article body.
- Preserve native links and server-rendered output without JavaScript, visible focus and narrow reading layout. Categories use section-scoped URLs.
- Do not add a loading boundary: early streaming can turn later notFound responses into HTTP 200. Add owned not-found/error presentation; verify real HTTP status. Expected service failures render a generic non-indexed state; no 503 claim is made for Next page rendering.
- No schema, auth, lifecycle or URL-contract changes. Task 20 owns complete SEO/canonical metadata.

## Decisions

- Reuse the validated backend projection type through explicit type-only frontend imports, as permitted by the ownership rules. No duplicate shared detail shape or runtime backend dependency is introduced.
- Keep the related group below the article at narrow widths and in three columns where space permits; the shell already supplies native search. Avoid an extra sidebar that narrows the reading measure.

## Verification

1. Focused failing tests for missing/unavailable/found detail, credits/media/taxonomy, metadata and related exclusion/fallback.
2. Implement shared browser-safe detail types, page components, request reuse and bounded related reads; run unit/types/lint/format.
3. Review once; use a disposable populated production app for responsive/no-JS, owner-versus-anonymous parity, draft/archive 404, unsafe-body unavailable and edit/archive/restore freshness.
4. Run production build and relevant regressions, remove test fixtures/services, update authoritative docs/status, commit focused changes and open a main-targeting draft PR.
