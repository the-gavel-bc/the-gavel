# Deferred and open review items

Items found by a review that were deliberately not done, with the reason, so they are not lost. Update this file when an item is done, rejected, or re-decided. Source reports: [REVIEW-REPORT.md](REVIEW-REPORT.md) (media), [AREA-1-AUTH-REPORT.md](AREA-1-AUTH-REPORT.md) (authentication and access).

| Area | Item | Why not done | What would settle it |
| --- | --- | --- | --- |
| Media | Browser (Playwright) test of the editor upload flow | The e2e fixtures have no editor account, and the suite needs the isolated local Supabase on port 54321 | Add an editor user to the e2e fixtures; test: author submits, upload control locked; editor uploads on the submitted article |
| Media | Screen for `purge_article_image` | Rare takedown tool; the owner accepted a database-level tool for now | Runbook `docs/runbooks/purge-article-image.md` is written; build an admin screen if takedowns become routine |
| Media | The daily cleanup still re-sweeps every retired key forever | Indexed and concurrency-capped, but the policy change (stop re-sweeping old successes) needs real ledger sizes | Revisit when the ledger holds tens of thousands of keys; measure a full sweep against its 40 s budget |
| Media | Raw per-reviewer reports for the media run were not saved | The first run captured them in chat only | Later runs save raw reports under `docs/code-reviews/raw/` in the reviewer's checkout |
| Auth | Session expiry mid-edit reads as lost access (LOGIC-002) | A full fix needs a distinct signed-out result in every draft action and a preserved redirect target; only a message hint was added | Add an `unauthenticated` result code, pass a validated `next` through sign-in |
| Auth | Google `hd` claim is never verified (SEC-002) | Depends on what Google sends for non-Workspace accounts with a bc.edu address; cannot be settled from the code, and requiring a missing claim would lock people out | In staging, sign in with such an account and inspect `auth.identities.identity_data`; then require `hd` if present |
| Auth | `/api/session/desk` forwards junk-cookie requests to Supabase Auth (SEC-004) | No data exposure; the proper control is a platform rate limit | Add a Vercel firewall rate limit for that path |
| Auth | Dashboard nav may not update after a mid-session role change (LOGIC-005) | Needs a runtime check; every page and action rechecks, so there is no access gain | Playwright with two contexts: demote in one, navigate in the other |
| Auth | Invite form hint for skipped (already listed) addresses (LOGIC-004) | Copy on the access-pending page was fixed; the form hint touches the staff UI | Show "already a member, reactivate from the list" for skipped entries |
| Auth | Admin page unit tests for homepage, media cleanup, site, taxonomy, members audit (TEST-002) | Large test-only batch; guard tests for the actions were done first | One denial test per page (author, editor, pending) |
| Auth | `claim_invitation` pgTAP branches, revocation-mid-session browser test, eligibility parity table, CSP header e2e assertions, dashboard layout nav test, sign-in and access-pending tests (TEST-003 to 010) | Test-only; lower risk than the fixes, and several need the e2e stack | See AREA-1-AUTH-REPORT.md for each assertion |
| Local database tests | pgTAP files `027`, `056`, `057`, `058` fail on the long-lived local database | They depend on leftover local data and fixtures (profile names, taxonomy rows, ineligible identities); they failed before this work | Run `pnpm test:db:clean` on a freshly reset database |
| Staff | All area 2 findings | Review only so far; see [AREA-2-STAFF-REPORT.md](AREA-2-STAFF-REPORT.md) | Owner approval of the batches in that plan |
| Publication date | Playwright flow (create a draft with a past date, submit, publish as editor, see the date on the public page) | Owner said not to worry about browser tests; the whole browser suite is already red and deferred | Add the spec when the browser suite is repaired; database and unit coverage exist (pgTAP `070`, contract and field tests) |
| Editor review queue | A row with both `submitted_at` and `published_at` null passed the response schema and produced null as the typed string `at` (`src/backend/articles/review-queue/review-queue.ts:52`) | Approved by the owner as a separate follow-up; implementation is in the stacked timestamp fix PR | Merge the fix, then remove this row |
| Editor (mobile) | An automated tap on Save in an iPhone 13 viewport right after editing the date field was reported as blocked by the tag entry row | Not reproduced by a direct hit test (the Save button is the top element at rest and after scrolling; only the save bar has a stacking order); likely an automation scrolling artifact, but unconfirmed | Try on a real phone or the simulator: edit the date, then tap Save |

## Deferred from the combined review (areas 3, 4, 5, 10, 11)

Everything the fix plan does not cover. Source: [COMBINED-REVIEW-REPORT.md](COMBINED-REVIEW-REPORT.md); IDs refer to it.

| ID | Item | Why deferred | What would settle it |
| --- | --- | --- | --- |
| C-04 | Reversing the historical publication-date backfill | The migration already merged. Backfilled and explicitly chosen dates are indistinguishable by value. | Revisit only with reliable provenance and owner approval. |
| C-08 | Distinct codes and messages for submit conflict, readiness failures and over-long return notes | Needs new error codes in the public contract, which need approval | Decide codes; map them in the lifecycle controls |
| C-10, C-11 | Restrict the anonymous `tags` read and the `profiles` read policies | Policy changes that affect public tag pages and member lookups; need a design and tests first | Serve the tag page through a definer function requiring a published article; split the profile policy into member and public |
| C-12 (edge follow-up) | Per-IP edge limits | Platform firewall changes need real traffic measurements | Evaluate Vercel firewall rules for search, suggestions, sitemap and media. Separate database budgets and try-locks are covered by Batch 4. |
| C-14 | Shorter public cache for takedowns, magic-byte check on photos, cache-bypass by query string | Trade-off against CDN load | Decide the takedown window (about 60 s) and add the check |
| C-15 | Hosted GraphQL exposure | Batch 3 removes unused cleanup RPCs. Hosted schema exposure needs separate verification. | Check the hosted Supabase schema configuration before proposing changes. |
| C-16, C-17, C-18, C-20 (helper only) | Lock-order documentation and fixes, slug lock only when the title changes, revision and receipt retention, a shared stored-input helper | Each needs a design note and concurrency tests | Write the global lock order in docs/architecture.md first |
| C-21 | Permanent legacy-slug compatibility branches; audit-action constraint revalidation under lock | Low risk now | Add a dated removal note; use `not valid` then `validate` for the next action |
| C-22 | Resized image variants, `srcset` and `sizes` | Large feature | Generate 480 and 960 px variants at finalize and serve them through the authorized route |
| C-24 | ETag and 304 on public media | Needs a design | See the combined fix plan |
| C-25 | Slow-query suspects (tag, author and category scopes, detail double validation, typeahead LIKE) | No measurement yet | `EXPLAIN (ANALYZE)` against about 5,000 seeded articles before changing |
| C-26 | A database-backed Vitest suite that parses real anonymous RPC output with the production schemas; run the two public-search scripts in CI | Needs a CI database step | Parameterize the scripts and add them to CI |
| C-27 | Repair the 13 stale browser specs and add an editor fixture | About 2 days; needs the isolated local stack | Shared confirm-dialog helper, admin actor, one-off credits, editor user (diagnosis per spec is in the area 11 report) |
| C-29 | Runbooks (backup and restore, rollback, incident, secret rotation), release procedure for migrate-then-deploy, health endpoint and cron alerting, hosted Supabase and Vercel settings | Mostly dashboard and process decisions; the Supabase plan and point-in-time recovery are undecided | Decide the plan; write and rehearse a restore |
| C-31 | Escape dismissal, dialog focus trap and inert page; browser Back guard in the editor; one in-page confirm everywhere | Needs a design for the guard and runtime testing | Prefer a native `dialog` element; handle `popstate` |
| C-32 | Server enforcement of the five-contributor limit and resetting unconfirmed combobox text on blur | The disposable database has no credited articles. The save validator also accepts old payloads up to 32 before computing receipt fingerprints. A lower global limit could prevent retries and edits of existing articles. | Count existing credits in representative data. Add a context-aware write limit after exact receipt lookup, and prove legacy edits and retries. Review blur behavior separately. |
| C-33 | Save-bar phone layout, visible reason for disabled Submit and Publish, linked recovery panel, focus after success | Needs a runtime check at 320 and 375 px | Real phone or simulator check, then adjust |
| C-35 | Refactor the upload pipeline duplicates and the 587-line draft form | Larger refactor with regression risk | After the test batch lands |
| C-36 (rest) | Toolbar roving focus and headings, typed-but-not-added tag text, field error styling, body-image form collapse | Polish with design choices | Group into a design-system pass (area 12) |

## Deferred from areas 6 to 9 and 12

Source: [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md); IDs refer to it. Items planned in [COMBINED-FIX-PLAN.md](COMBINED-FIX-PLAN.md) are not repeated here.

| ID | Item | Why deferred | What would settle it |
| --- | --- | --- | --- |
| D-03 | Tag merge targets are limited to the current page, and category creation can omit sections | Deferred from Batch 1 by the owner | Order the admin tag list by name and add search. Look up merge targets across all tags on the server. Load all sections up to the navigation limit in the category form. |
| D-04 | Deleting a section can also delete its protected “Outside of BC” category | Deferred from Batch 1 by the owner | Add a forward migration that returns `conflict` when section deletion would remove the protected category. Cover direct category deletion and section deletion with pgTAP. |
| D-05, D-20 | Homepage keyboard moves between rows and to the lead, focus management, live regions, library counts and inline errors, Discard confirmation, phone layout | Interface work with design choices and runtime checks on touch devices | Add "Make lead" and "Move to" buttons that call the arrangement rules; test on iOS and Android |
| D-15 | Member credit consent | Editorial review remains the control under ADR 0014 | Revisit if editorial review proves insufficient |
| D-08 (remainder) | Quota recovery for one-off credits held only by revisions | Historical references prevent deletion during orphan cleanup | Define how editors can recover these slots without changing article history |
| D-10 (remainder) | Tailored stale-editor message after a taxonomy change | Versioned writes now surface the existing conflict and recovery flow | Revisit if the shared conflict message proves insufficient |
| D-18 | Field-level validation errors and focus in the admin forms; homepage live regions | Interface pass across four forms | Per-field errors with `aria-invalid`, describedby and focus on the first invalid field |
| D-16 (remainder), D-21 | Breakpoint consolidation, broader shared component tests, and native confirmation dialogs | Broader dashboard refactor | Verify dialog focus and responsive layout together |
| D-17 (remainder) | Dashboard error, not-found and loading boundaries | Needs runtime checks | Verify at 375 px and Slow 4G |
| D-25 (part) | Site information change detail in the audit and audit search index | Needs measurement | Measure with EXPLAIN at about 100,000 rows |
| D-26 | Browser specs for homepage, taxonomy, public authors and audit | Part of repairing the stale browser suite (C-27) | See C-27 |
| D-28 | Bounded searched editor catalogs, search ranking, archive and byline alignment, JSON-LD for credit-only writers, navigation limit | Each needs a small design or product answer | Handle after the cheap batches |

## Decided, not built yet (ADR 0014)

The owner delegated the open decisions; they are resolved in [ADR 0014](../decisions/0014-review-follow-up-decisions.md). These are not in the first fix batches, so they stay here until built. Each needs tests and doc updates when built.

| Decision | What to build | Notes |
| --- | --- | --- |
| 18 Hosted settings | Verify and record email signup disabled, the `hd` claim, backup and recovery plan | Not code; owner or dashboard action |

## Deferred from the gap lenses

Source: [GAP-LENSES-REPORT.md](GAP-LENSES-REPORT.md). Items planned in COMBINED-FIX-PLAN.md are not repeated.

| ID | Item | Why deferred | What would settle it |
| --- | --- | --- | --- |
| G-01 | Possible crash from long emoji titles (UTF-16 versus code point length in dashboard schemas) | A 130-emoji title was not reproduced at runtime; the claim may rest on a different count | Add an astral-character length test to the dashboard schemas; fix only if it fails |
| G-07, G-08, G-09, G-18 | Editor load path and save revalidation cost, metering of large drafts, revision quota, draft cap and slug probing, per-row read policy cost, the smaller performance items | Need measurements (request counts, EXPLAIN at 50,000 rows, bundle analyzer) and design choices | Measure first; see the fix plan |
| G-13 | The admin article list and detail omit review state. The list also lacks an In review filter, a link to the first page, and publication and archive dates. | Deferred from Batch 1 by the owner | Read `review_requested_at`, display the In review badge on both pages, and add the filter, first-page link, and dates to the list. |
| G-19 | Link allowlist for plain http and private addresses; admin pages answering 200 for non-administrators | Informational | Optional hardening |

## Still unverified at runtime

See [RUNTIME-VERIFICATION.md](RUNTIME-VERIFICATION.md). Not proven: tag merge past 50 tags (D-03), lifecycle controls staying locked after a status-keeping action (C-34), all keyboard, drag-and-drop, focus and screen reader findings, and the unreproduced Save tap on an iPhone viewport. Refuted: the mobile reader menu staying open after a link (12/ux-1); remove it from any list of open items.

## Decided not to change (so they are not re-raised)

| Area | Item | Decision and reason |
| --- | --- | --- |
| Media | `save_*` and the lifecycle function evaluate `article_authority` inside a `WHERE ... FOR UPDATE` (ARCH-008) | Accepted. After a lock wait the expected-version check, not the predicate, rejects stale writes; covered by the versioned conflict tests. Recorded in ADR 0012. |
| Media | `article_authority` does not itself check Auth eligibility (SEC-005) | Accepted with a documented precondition: callers prove eligibility, because checking inside would turn an ineligible identity's `forbidden` into `not_found`. Guarded by pgTAP `069`. Recorded in ADR 0012. |
| Media | Reviewer claim that editors cannot cancel uploads (TEST-002) | Rejected: the cancel path is `mark_article_image_for_removal`, which uses `article_authority`. |
| Media | Reviewer claim of a dead `listUnusedArticleUploads` TypeScript action (LOGIC-006) | Rejected: no such action exists. The obsolete database function was removed in Batch 9j. |
| Media | Cleanup and expiry cron routes return 404 outside production (preview deployments have no coverage) | Left as is: scheduled deletion jobs must not run against preview data. Revisit only if a staging environment with real storage is added. |
| Media | Media changes on published articles are administrator-only | Decided (owner delegated, chosen for security): recorded in ADR 0012. |
| Auth | Submit-for-review rule differs between SQL (any owner) and the interface (authors only) | Decided: leave SQL permissive (harmless, owner only) and offer submit to authors only, since editors and administrators publish directly. The permission matrix now says "not needed". |

## What each review implemented

- Media (quick run, 4 reviewers): every finding that was verified real was implemented, except the items in the first table. Nothing was skipped for being low impact; the deferred items were deferred for dependencies (e2e stack, real data sizes) or because they need an owner decision.
- Area 1 (authentication and access): the real defects were fixed (editor read scope, callback errors, lost claim race, wording). The remaining Low and test-only findings were deferred and are listed above; none of them is a security gap.
- Area 2 (staff and roles): Batch 7 S2-01 through S2-11 are implemented locally on `fix/staff-role-hardening`; S2-12 is measurement only. Full Vitest, pgTAP, concurrency, DB lint, build, type, lint, format and generated-type checks passed. Final independent diff review remains; nothing is published. See AREA-2-STAFF-REPORT.md and the [Batch 7 plan](../superpowers/plans/2026-11-19-review-fixes.md#7-staff-and-roles).
| CI | Hosted verification of the repaired browser suite (C-27) | A full isolated local run passed with 197 tests and three intentional skips for shared settings. GitHub Actions did not start its jobs because of the account billing or spending limit. | Rerun the hosted foundation job when GitHub Actions can start. |

## Performance review decisions (2026-11-26)

Two read-only reviews ran on 2026-11-26: the staff dashboard and the public reader. The approved items are planned in [2026-11-26-performance-batch.md](../superpowers/plans/2026-11-26-performance-batch.md). This table records what was not approved, with the owner's decision.

| # | Item | Decision | Why | What would settle it |
| --- | --- | --- | --- | --- |
| 8 | Data cache for public reads (article, homepage, archives, author pages) | Deferred by the owner | Every write that changes public content must clear the cache. Corrections, guest-credit edits, own-profile name, bio and photo edits, and main-image changes on published articles do not clear any cache today, so a missed clear would show stale content for up to the expiry. | Recommended form: one broad tag cleared on every public write, a 60-second expiry, and a test that each public write clears it. Revisit if reader time to first byte stays slow after the batch. |
| — | Full-page CDN caching (the usual approach of large news sites) | Deferred | The per-request CSP nonce makes every public HTML response unique, so whole pages cannot be cached at the CDN. Changing that is a security-header change and needs approval. | Switch public pages to a hash-based CSP, then cache pages at the CDN and purge on publish. |
| 10 | Serve stale images while refreshing (`stale-while-revalidate` on public media) | Rejected by the owner | An archived article's image could stay visible for up to an hour. That breaks the approved five-minute takedown bound. | — |
| 11 | `getClaims` instead of `getUser` in `getCurrentAccess` | Not approved | It saves about 10 ms, but a revoked or signed-out session stays valid until its JWT expires (up to an hour). | Owner approval of the revocation trade-off. |
| 12 | Inline `articles` select RLS policy (no per-row security-definer call) and an `(owner_profile_id, updated_at desc, id desc)` index | Deferred | Authorization-path change. Negligible at the current catalog size. | `EXPLAIN (ANALYZE, BUFFERS)` as an author with hundreds of articles. Then owner approval and the pgTAP suite. |
| — | Fetch section and latest related stories in parallel (`article-context.ts`) | Dropped | Vercel and Supabase now share a region, so it saves about 2 ms, and it would add a query on every article view. | Revisit if the regions ever differ. |
| — | Stop clearing the public shell on draft saves | Not needed | Review finding was wrong: only `savePublishedArticleAction` clears it (`draft-actions.ts:102`). | — |
| — | One-hour CDN cache for `/sitemap.xml` | Dropped | `no-store` is the documented sitemap contract (`docs/api-contracts.md`), and the route is crawler-only and low volume. | Revisit if sitemap load shows up in the search budget. |
| — | Cold-start time on Vercel Hobby | Measure first | It is the most likely cause of slow first clicks, but it is a platform limit. | Compare a menu click's response time after a few idle minutes with an immediate second click (browser Network tab or Vercel logs). |
| — | `ReaderImage` hydrates on every card; global search budget (80 searches, 40 suggestions per minute) | Low priority | Small cost; the search budget is a reliability concern only under real load. | Measure under real traffic. |

C-22 (resized image variants) and the typeahead part of C-25 are now planned in the batch above.
