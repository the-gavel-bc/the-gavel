# Phase 5 Task 12 — public article page

Status: implemented and locally verified on `feat/public-article-page`, based on Task 11 PR #60. All preceding reader PRs through #60 are now merged; this task targets and is synchronized with main.

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


## Verification record

- Focused RED: the route and related-helper tests initially failed because their implementation modules did not exist. GREEN: 14 initial query/page cases passed; an additional related presentation/metadata fallback case passed in the six-case route rerun.
- `pnpm test --maxWorkers=2`: 711 passed, one existing import-boundary case exceeded its default 5-second timeout during concurrent local startup/builds. The unchanged 13-case module passed with `--testTimeout=15000` and again with the default timeout. No timeout or assertion was weakened in repository configuration.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `git diff --check` passed. The production build includes dynamic `/articles/[slug]`.
- `pnpm exec playwright test e2e/public-article/public-article.spec.ts`: two desktop cases passed; mobile setup initially collided on a shared section name. Adding the project to that synthetic name fixed the fixture. `--project=mobile` then passed both cases. These verify real HTTP 404 for private/archived/missing slugs even for owners, anonymous/owner parity, no-store HTML, unsupported-body noindex, visible link focus and 320px no-JavaScript reading.
- Disposable production Chromium proof at 320/768/1440px passed: one detail RPC per page request (metadata included), no horizontal overflow, rich body/credits, decoded eager main and lazy body images, safe external links, native keyboard focus, and three related stories excluding the current article. Public media carries the approved five-minute cache header.
- Checked `save_published_article`, `archive_article` and `restore_article` RPCs proved next-request title freshness, stable slug/publication time, article/origin-media 404 immediately after archive, and restored readability. No-JavaScript 320px rich-body proof passed. Removing a synthetic article physically also returned real 404 without its former title.
- One fresh-context read-only review found no issues. No migrations, authorization, direct grants, dependency or cleanup behavior changed; those heavy suites were not rerun.

The first disposable Supabase startup failed unrelated analytics/vector/Studio health checks. A reduced service startup succeeded. Synthetic fixtures on the existing browser-test database were removed by suite teardown; the disposable stack and app were stopped after proof. Temporary probes and scripts are outside the repository. Hosted CI is owner-monitored. Human visual, rich-content/security and screen-reader approval, plus later public destinations and complete SEO, remain pending. Rollback is application-only: revert this task's route/components/helper without changing stored content or SQL grants.
