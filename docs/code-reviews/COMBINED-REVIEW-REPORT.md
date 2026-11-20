# Combined review: areas 3, 5, 11, 10 and 4

Quick runs (13 Sonnet reviewers, read-only) on commit `feat/publication-date` (`4eeec9d` plus its docs commit). 152 raw findings: lifecycle and drafts 33, public reader and search 30, CI and dependencies 26, database layer 17, article editor 46. No Critical findings. No exposure of private data through table grants, function grants, `security definer` search paths or storage policies (verified against a catalog snapshot of the live local schema). Full per-reviewer reports were saved in the reviewer's checkout (`docs/code-reviews/raw/area{3,4,5,10,11}-*.md`, not committed); this file consolidates them. Source IDs are written `area/reviewer-number` (for example `3/logic-1`). Status uses: **Fix now** (urgent), **Cheap** (small, low risk), **Plan** (next, needs design or runtime proof), **Deferred** (see [DEFERRED.md](DEFERRED.md)). The fix plan is in [COMBINED-FIX-PLAN.md](COMBINED-FIX-PLAN.md).

Corrections to earlier notes: the `picomatch` dependency advisory is no longer returned by the registry, so `pnpm audit` passes; the DEFERRED row that called it a blocker was stale. The remaining advisories are two moderate ones in production `next` (patched in 16.4.5, latest 16.4.6) and one dev-only `minimatch`.

## Review coverage (all areas)

| # | Area | Status | Report |
| --- | --- | --- | --- |
| media | Media pipeline (uploads, expiry, cleanup, profile photos) | Reviewed and fixed | [REVIEW-REPORT.md](REVIEW-REPORT.md), [FINAL-IMPLEMENTATION-REPORT.md](FINAL-IMPLEMENTATION-REPORT.md) |
| 1 | Authentication and access | Reviewed, real defects fixed, rest deferred | [AREA-1-AUTH-REPORT.md](AREA-1-AUTH-REPORT.md) |
| 2 | Staff and roles | Reviewed, nothing implemented yet | [AREA-2-STAFF-REPORT.md](AREA-2-STAFF-REPORT.md) |
| 3 | Article lifecycle and drafts | Reviewed (this report) | this file |
| 4 | Article editor UI | Reviewed (this report) | this file |
| 5 | Public reader and search | Reviewed (this report) | this file |
| 10 | Database layer overall | Reviewed (this report) | this file |
| 11 | CI, deployment and dependencies | Reviewed (this report) | this file |
| 6 | Homepage curation | Reviewed | [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md) |
| 7 | Taxonomy and tags | Reviewed | [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md) |
| 8 | Profiles and one-off credits | Reviewed | [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md) |
| 9 | Site information and the admin audit log | Reviewed | [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md) |
| 12 | Design system and accessibility sweep | Reviewed | [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md) |

Notes: every area in the list has now been reviewed at least once (quick runs, static reading). Areas 6 to 9 and 12 are in [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md). The `tags` and `profiles` read policies (C-10, C-11) are reported once, in this file. Reviews so far were static: no query plans, browser runs or screen reader checks were done.

## Runtime verification (2026-11-20)

Findings checked in a running build are listed in [RUNTIME-VERIFICATION.md](RUNTIME-VERIFICATION.md). Confirmed: C-05 (byline shows the wrong day), C-10 (anonymous tag read and a 200 page for an unused tag), C-11 (a non-member session reads a credit-only profile's name and biography), C-12 (typeahead starves search: "Search is busy"), C-14 and C-24 (cache headers), C-33 (the save bar is 491 px wide on a 375 px or 320 px phone with four buttons, so Save is off-screen: now **Fix now**, see C-40). Refuted: the mobile menu staying open after a link.

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-40 | High | On a phone (375 and 320 px) the editor's sticky save bar is 491 px wide with four buttons (Cancel, Return, Publish, Save), so the page scrolls sideways and Save sits off the right edge. Fix: let the button row wrap and give the bar `min-width: 0`. | 4/ux-7, 11/test-10 (confirmed in a running build) | Fix now |

## Bugs in code written this week (fix first)

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-01 | Medium | Publish never clears `review_requested_at`, so published articles still show "In review" to authors, in the editor banner and in the review queue; no CHECK ties the review columns to draft status. | 3/logic-1, 3/arch-10 | Fix now |
| C-02 | Medium | The author's "My articles" row actions assume every editor published their own articles (`publishedByMe` hardcoded), so Archive is offered on articles they did not publish and the database answers "no longer available". | 3/logic-2 | Fix now |
| C-03 | Low | After an editor returns a draft, the refresh lands on a not-found page because the editor lost read access to it. Navigate to the review queue instead. | 3/logic-7 | Fix now |
| C-04 | Medium | The publication date migration's backfill update fires the `updated_at` trigger on every published and archived article, so older browser tabs see spurious "changed" saves. Null already means "the publish day", so the backfill is unnecessary. Not yet merged anywhere. | 3/arch-1 | Fix now |
| C-05 | Medium | Bylines (article header, homepage hero, preview cards) format dates in UTC while the publication date is an Eastern date, so an evening publish shows the next day. Verified in `article-header.tsx`, `home-hero.tsx`, `preview-meta.tsx`. | 5/test-7 | Fix now |
| C-06 | Low | Clearing the publication date on a published article leaves the backdated `published_at`, so the form is blank while readers see the old date; a client that omits the key wipes the stored date. | 3/logic-5, 3/logic-6, 3/arch-2 | Cheap (derive the date from `published_at`); absent-means-clear is documented |
| C-07 | Low | The "who sets the date" wording in ADR 0013 reads as editors only; the owner decision is whoever can edit. | 3/logic decision challenge | Cheap (doc) |
| C-08 | Low | Submit refused for an unfinished upload, a failed readiness check and a return note over 500 characters all show generic messages ("changed elsewhere, reload" or one invalid-input text). | 3/logic-3, 3/logic-4 | Plan |
| C-09 | Low | Save replay paths use authority mode `edit` where transitions use `replay`, so a lost response can come back as not found; restore does not re-check the publication date. | 3/arch-4, 3/test handoff | Cheap (mode), decision needed (restore) |

## Security and privacy

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-10 | Medium | Anonymous callers can read the whole `tags` table, so tags created on drafts or in-review articles leak and `/tags/<slug>` returns 200 for a tag no published article uses. | 5/sec-1, 10/sec-3 | Plan |
| C-11 | Medium | `profiles_authenticated_read` has no member or eligibility check, so any Google-signed-in outsider (if hosted signup allows it) can list credit-only profile names and bios, including people credited on unpublished drafts; the anon column grant also exposes account ids and join dates. | 10/sec-2, 5/sec-3 | Plan |
| C-12 | Medium | Search and typeahead share one global 120-per-minute budget, both callable with the anon key, and hold an advisory lock for the whole request. One script can make search return rate-limited for every reader; the sitemap budget has the same weakness. | 5/sec-2, 5/perf-1, 10/sec-1, 10/arch-2 | Plan (separate budgets and try-lock); edge rate limits deferred |
| C-13 | Low | 14 private tables have row-level security off (including the invitations table with email addresses); safety rests on missing grants. No default-privilege revoke and no catalog-wide allowlist test. | 10/sec-5, 10/sec-4, 10/arch-6, 10/arch-7 | Cheap |
| C-14 | Low | Public image and photo cache for 5 minutes, so takedowns lag; the photo route skips the magic-byte check article media gets; a random query string bypasses the CDN cache and each miss downloads from Storage. | 5/sec-4,5,7, 5/perf-3 | Plan |
| C-15 | Info | Dead `security definer` functions (`record_media_cleanup_health`, two v1 retired-media functions); `graphql_public` exposed in `config.toml`. | 10/sec-6, 10/arch-10, 10/arch-11 | Cheap (drop functions); config needs the hosted check |

## Database and architecture

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-16 | Medium | Probable deadlock between the publish trigger's advisory lock 1106 and the profile admin function; tag merge versus article save can deadlock; the global lock order is documented nowhere; blanket `exception when others` turns deadlocks into "unavailable" and rolls back the rate-limit count. | 10/arch-1,4, 3/arch-5 | Plan (document order first; retryable code needs owner approval) |
| C-17 | Medium | `allocate_article_slug` takes a global advisory lock on every create and save, held to commit, even when the title is unchanged. | 3/arch-6 | Plan |
| C-18 | Medium | `article_revisions` stores a full snapshot (up to 2 MiB) per save and per transition, including no-content transitions, has no reader and no retention; receipts and ledgers have no cleanup. | 3/arch-7,8, 10/arch-8 | Plan |
| C-19 | Medium | About 12 tables have ON DELETE RESTRICT foreign keys to `auth.users`, so an Auth user who wrote anything cannot be deleted; no erasure policy is decided. | 10/arch-3 | Deferred (owner decision) |
| C-20 | Medium | The stored-input rebuild is copied in three functions and save bodies are largely duplicated; whole-body function regeneration across about 130 migrations has no CI guard (a hotfix stamped earlier than a recent migration would be overwritten on reset). | 3/arch-3, 10/arch-5 | Plan (helper function and a migration-order check) |
| C-21 | Low | Permanent legacy-slug branches, audit-action constraint re-validation under lock on each new action, docs drift (`api-contracts` says the editor UI "remains planned"; no release unit for migrations 20261119 to 20261121). | 3/arch-9,11, 10/arch-9 | Cheap (docs), Deferred (constraint) |

## Public reader and performance

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-22 | High | Card and article images are served at original upload size (up to 6000px) with no resized variants, `srcset` or `sizes`. | 5/perf-2 | Deferred (large) |
| C-23 | High | Every public page makes 4 to 5 uncached database calls (navigation and footer, about 9 queries for the footer); the layout awaits them before the page starts. | 5/perf-4,5 | Plan (cache about 60 s with tag revalidation; owner trade-off) |
| C-24 | Medium | Public media route downloads the file on every cache miss with no ETag or 304; the sitemap is `no-store` with a sequential loop and a shared budget (503s for crawlers at about 10k articles). | 5/perf-3,8 | Cheap (sitemap cache header), Plan (ETag) |
| C-25 | Medium | Public list scopes (tag, author, category) and search may scan the date index; detail validates the document twice per view; typeahead uses a leading-wildcard LIKE. | 5/perf-6,7,9,10 | Deferred (measure with EXPLAIN first) |
| C-26 | Medium | Public backend tests mock every RPC while the schemas are strict, so a new SQL key would make every public page "unavailable" with no test noticing; two public-search scripts are not in CI and are hard-wired to a temporary setup. | 5/test-1,2 | Plan |

## CI, dependencies and operations

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-27 | High | 13 stale browser specs keep CI red, normalise failures, and skip the audit steps that follow. The browser suite also has no editor user, so the review workflow has never had browser coverage. Per-spec causes are known (in-page dialogs, roles, credits); about 2 days including shared helpers. | 11/ops-3, 11/test-1..5, 11/ops-2 | Cheap (audit steps run regardless, config tweaks); repair Deferred |
| C-28 | Medium | Production `next` has two moderate advisories (patched in 16.4.5; latest 16.4.6). | 11/ops-1 | Cheap |
| C-29 | Medium | Startup validates only three environment variables; a missing `CRON_SECRET` or service-role key in production fails silently (crons return 401 forever). No health endpoint, error reporter or cron alerting; no backup, restore, rollback or rotation runbooks; no release procedure for migrate-then-deploy. | 11/ops-4,5,7,8 | Plan (env check, health endpoint); Deferred (runbooks, hosted settings) |
| C-30 | Low | CI hygiene: stale `feat/project-foundation` push trigger; `ubuntu-latest` drift; no failure artifacts; no `.next` or browser cache; Playwright `webServer` has no timeout; container name hard-coded in four places; no `engines.node`. | 11/ops-9..14, 11/test-6,11,12 | Cheap |

## Article editor (interface, code quality, tests)

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-31 | Medium | The in-page confirm dialog has no focus trap and the page behind is not inert; Escape or a backdrop click silently discards a typed return note; browser Back is unguarded in the editor and guarded links still use the native confirm. | 4/ux-1,2,3 | Plan (note-on-backdrop is Cheap) |
| C-32 | Medium | Contributors: "Add contributor" silently pre-selects the first person; reorder and remove drop focus; the combobox keeps typed text on blur; the five-contributor cap exists only in the interface (server allows 32). | 4/ux-4,5,6, 4/qual-12 | Cheap (pre-select, focus), decision needed (cap) |
| C-33 | Medium | Save bar: the reason Submit or Publish is disabled is hidden (tooltip only); the non-wrapping button row may overflow on a phone with three or four buttons; conflict recovery panel is unlinked and unfocused; success state loses focus after refresh. | 4/ux-7,8,9,17 | Plan (needs runtime check at 320 and 375 px) |
| C-34 | Medium | After a successful lifecycle action that keeps the status, controls and form may stay locked; a later failure overwrites a pending uncertain retry (`retry !== null`). | 4/qual-1,2 | Cheap (retry condition), Plan (lock, runtime check) |
| C-35 | Medium | Upload pipeline duplicated between main image and body image; JSON is parsed before the status check, hiding a non-JSON 429 or 5xx; a 587-line form with repeated predicates and nested ternaries; dead props and CSS. | 4/qual-3,5,6,7,11 | Deferred (refactor), Cheap (dead code) |
| C-36 | Low | Interface polish: Remove and Delete image use the primary fill, not danger; raw ids and error codes in labels and messages; field errors unstyled; tag text typed but not added is lost on Save; toolbar has about 12 tab stops; the design-system doc says the toolbar is sticky but the CSS is not. | 4/ux-10..18 | Cheap (danger variant, doc, wording); Deferred (rest) |
| C-37 | High (test gaps) | Publication date field, "In review" and "Returned" banners, the read-only page for authors in review, the real note dialog, lifecycle failure and retry paths, save status messages, and navigation guard with the real confirm have no tests. | 4/test-1..14 | Plan (test batch) |

## Test coverage (lifecycle and public)

| ID | Sev | Finding | Source | Status |
| --- | --- | --- | --- | --- |
| C-38 | High (test gaps) | No database test of an editor calling restore or delete; submit and return have no replay, conflict or race tests; per-operation lock-wait revocation races exist only for create and save; publication date tests use only two January dates (no today boundary, daylight-saving, midnight, restore of a backdated article, date versus publish race); rate-limit replay untested; the TypeScript capability table is hand-mirrored from SQL; the authority scan matches regex on source. | 3/test-1..15 | Plan (test batch) |
| C-39 | Medium | Public tests: no inactive owner, section, category or contributor cases for the public detail and media; visibility simulated with raw status updates instead of real lifecycle functions; backdated dates not asserted in list, search and sitemap order; search edge cases (accents, operators, boundaries) and cache headers unasserted; page-level pagination mock-only. | 5/test-3..13 | Plan (test batch) |

## What was verified clean

Article, list, search, suggestion, sitemap and homepage RPCs and routes (published-only allowlists, one-off credit slugs stripped, strict bounds), no `dangerouslySetInnerHTML` or JSON-LD, no service role on public paths, no open redirect, error pages show no internals; every table in `public` has row-level security; every `security definer` function has an empty search path; anon and authenticated grants match intent; the SQL transition and authority logic, receipts and replay, slug allocation and freezing, and archived deletion had no logic findings; headers in `next.config.ts` are sound; CI actions are SHA-pinned with read-only permissions; the cron auth is sound.

## Not examined

Hosted Vercel and Supabase settings (signup, backups, point-in-time recovery, environment scoping, alerts, exposed schemas); runtime behavior (no suites, builds or query plans were run by reviewers); rendered visuals and screen reader behavior for every area.
