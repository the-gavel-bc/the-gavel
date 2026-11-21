# Fix plan for the combined review

Companion to [COMBINED-REVIEW-REPORT.md](COMBINED-REVIEW-REPORT.md). Scope: urgent bugs and cheap fixes only. Everything else is in [DEFERRED.md](DEFERRED.md) with its reason. The original seven review branches are merged into `main` through PR #128. The expanded sequence below tracks the follow-up work. D-03, D-04 and G-13 were moved to the deferred register by the owner.

## Follow-up progress

- Batch 1 follow-up is implemented on `fix/urgent-review-gaps`. The branch adds the save bar fix, audit action parity, contributor selection recovery, request-scoped access caching, publication date validation and My articles recovery.
- C-05 and the original CI and staff batches are already on `main`. The C-27 browser repairs pass locally, including both Playwright projects. Hosted verification is tracked in the deferred register.
- Batch 3 follow-up includes D-12, G-03, G-04 and G-12 on the working branch. Profile writes now check eligibility before waiting for the global locks (D-13). Moving the guest credit quota ahead of the locks while preserving exact retries remains open, alongside D-11 and G-11.
- The working branch also includes D-14, G-05 and G-06 with focused regression coverage. G-01 did not reproduce in the review queue with a 240-code-point title.

## Master sequence (single ordered list)

This table is the one execution order. It maps every finding ID in the reports to a batch (C = [COMBINED-REVIEW-REPORT.md](COMBINED-REVIEW-REPORT.md), D = [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md), G = [GAP-LENSES-REPORT.md](GAP-LENSES-REPORT.md), S2 = [AREA-2-STAFF-REPORT.md](AREA-2-STAFF-REPORT.md)). The detailed sections that follow (batches 1 to 7 and the additions 1b, 1c, 3b, 3c, 5b, 5c, 6b, 6c) are the specifications; the "b" and "c" additions are merged into the batches below. Anything not listed is in [DEFERRED.md](DEFERRED.md) (including the decisions in [ADR 0014](../decisions/0014-review-follow-up-decisions.md) that are not built yet). One branch and one PR per batch; batches 1 and 2 first because they are user-visible bugs.

| Batch | Scope | Finding IDs | Depends on |
| --- | --- | --- | --- |
| 1 | Urgent bugs (one migration plus interface fixes) | C-40 (save bar on phones, CSS first), C-01, C-02, C-03, C-04, C-06, C-07, C-09, D-01 (audit page), D-02 (contributor combobox), G-02 (memoize access), G-10 (date floor), G-16 | none |
| 2 | Bylines in Eastern time | C-05 | none |
| 3 | Database hygiene and checks before locks (one or two migrations) | C-13, C-15, D-11, D-12, D-13, G-03, G-04, G-11, G-12 (control characters, 100 section cap), S2-05, S2-08, migration version check in CI | 1 |
| 4 | Confirmed read-surface leaks (design note first) | C-10 (anonymous tag read, `/tags` page), C-11 (profiles read policy and anon column grant), C-12 (separate search and typeahead budgets, try-lock) | 3 |
| 5 | CI and dependencies | C-28, C-30, C-27 (partial: audit steps always run, config), then C-27 repair as its own PR | none |
| 6 | Interface quick fixes and documentation | C-31 (note kept on backdrop), C-32 (pre-select, focus), C-34, C-35 (dead code), C-36, D-14, D-16 (cheap), D-17, D-19 (reduced motion, docs), D-21 (dead CSS), D-27, C-21 (docs), G-05, G-06, G-14, D-18 (field errors) | 1 |
| 7 | Tests (one PR per area) | C-37, C-38, C-39, C-26 (subset), D-22, D-23, D-24, D-25, D-26, G-01 (astral length test), G-17, S2 test gaps | 1, 3 |
| 8 | Area 2 fixes | S2-01, S2-02, S2-03, S2-04, S2-06, S2-07, S2-09, S2-10, S2-11 | 3, 7 |
| 9 | Decided and designed (ADR 0014), one PR each | 9a caps, reserved slugs, non-Latin slugs, section cap (D-08, D-09, G-12 rest); 9b redirects and merge revisions (D-10, C-10 follow-up); 9c profile moderation (D-07); 9d audit immutability trigger and erasure policy (D-25 part, C-19); 9e navigation cache and retryable code (C-23, C-16 part); 9f homepage editor baseline and eligibility (D-06); 9g contributor cap (C-32 cap, D-02 follow-up); 9h design system consolidation (D-16 rest, D-19 rest); 9i letters stable slug (G-15); 9j drop dead functions (C-15 rest) | 4, 7 |
| 10 | Measure first, then decide | C-08, C-14, C-16, C-17, C-18, C-20, C-22, C-24 (cache header cheap now), C-25, C-29 (runbooks, health, env check), G-07, G-08, G-09, G-18, D-05 and D-20 (homepage interface), D-28 | measurements |

Not built by any batch because they need a hosted or owner action: hosted Supabase and Vercel settings, the Google `hd` check, backup plan (ADR 0014, decision 18).

## Batch 1: lifecycle bugs (urgent, one migration)

Findings C-01, C-02, C-03, C-04, C-06, C-09 (mode only), C-07.

- C-01: in `transition_article`, set `review_requested_at = null` on publish and restore; data fix for existing published rows; add a CHECK that review columns only exist while `status = 'draft'` (after the data fix; `NOT VALID` then validate). Tests: pgTAP assertion after publish; Vitest list shows no "In review" for published.
- C-02: select `published_by_profile_id` in the owner's list query and pass the real `publishedByMe` to `ArticleRowActions`. Test: an editor does not see Archive on an article an administrator published.
- C-03: after a successful return, navigate to `/dashboard/review` instead of `router.refresh()`. Test: lifecycle controls.
- C-04: remove the backfill from `20261121010000_publication_date.sql` (unmerged, so editing it is safe) and clear any local effect. Null means "the publish day", so nothing else changes.
- C-06: on `save_published_article`, when the date is cleared, store the Eastern date of `published_at` instead (the form then shows what readers see); document that a client omitting the key is treated as clearing.
- C-09: save replay paths use authority mode `replay`. Needs your decision: whether restore of a backdated article should re-check the publication date (a past date always passes, so this only matters for a hand-edited future date; I recommend adding the check for consistency).
- C-07: ADR 0013 wording: "whoever may edit the article sets it".
- Acceptance: pgTAP and Vitest for each; whole pgTAP suite and concurrency suite pass as before.

## Batch 2: bylines in Eastern time (urgent, no migration)

Finding C-05. Use `America/New_York` in `article-header.tsx`, `home-hero.tsx`, `preview-meta.tsx` (and any other reader date formatter found by search). Tests: 2026-11-10T02:30Z renders November 9; 2026-01-15T17:00Z renders January 15; the sitemap `lastmod` equals the published time. Acceptance: no date in the reader uses UTC.

## Batch 3: security and database hygiene (cheap, one migration)

Findings C-13, C-15.

- Enable row-level security (no policies) on the 14 private tables; no behavior change because the definer functions run as owner. Verify with the whole pgTAP suite and concurrency suite.
- Revoke default privileges for future objects in `public` and `private` from `anon` and `authenticated`.
- Add one pgTAP file asserting: RLS on every `public` table, fixed search path on every `security definer` function, no anon execute outside an allowlist, no write grant to anon. (This is the guard the review found missing.)
- Drop `record_media_cleanup_health`, `register_retired_media_key` v1 and `finish_retired_article_scan` v1 after confirming no caller; regenerate types.
- Add a CI check that each new migration's version exceeds all existing ones.

### Expanded Batch 4 design for discussion

- **C-10:** Define a public tag by the same publish eligibility predicate used by the article archive. Make the anonymous tag policy and archive lookup use that predicate so a tag with no eligible public story returns 404. Keep the editor catalog available to eligible active members. Add an indexed existence check and verify draft-only, archived-only and published associations separately.
- **C-11:** Give authenticated non-members the same published profile scope as anonymous readers. Preserve the active member catalog used by the editor and the administrator's access to inactive profiles. Restrict anonymous projection columns to fields used by the public author page and verify that the account identifier and creation date are unavailable. Test pending and ineligible sessions, active editors and administrators, and public author metadata.
- **C-12:** Give search and typeahead separate sequence budgets and transaction lock keys. Use try-locks so a competing request returns the existing rate-limit response immediately. Keep the current combined allowance until there is evidence to raise it. Verify lane independence, ticket accounting after cancellation, and retry responses. Hosted edge throttling remains a separate decision.

## Batch 4: CI and dependencies (cheap, no migration)

Findings C-27 (partial), C-28, C-30.

- Move the two `pnpm audit` steps so they run regardless of the browser step (`if: always()` or a separate job) so a red browser suite cannot hide audit results.
- Bump `next` and `eslint-config-next` to 16.4.6 and rerun typecheck, lint, tests and build.
- Playwright: `webServer.timeout` 180 s; upload traces and results on failure; one `dbContainer()` helper; remove the stale `feat/project-foundation` trigger; pin `ubuntu-24.04`; add `engines.node >=22.13`; cache `.next/cache` and the Playwright browser.
- Update DEFERRED.md: the picomatch row was stale. Acceptance: CI shows the audit steps even with a failing browser step.

## Batch 5: editor interface quick fixes (cheap)

Findings C-31 (note only), C-32 (pre-select and focus), C-34 (retry), C-35 (dead code), C-36.

- Keep a typed return note when the backdrop is clicked (ignore backdrop clicks while a note is typed; label the field; add a counter).
- "Add contributor" adds an empty row and requires a choice; keep focus on the moved or removed row and announce it.
- `retry?.operation === operation` in lifecycle controls and deletion; delete dead `locked`/`nativeInvalid` and dead CSS.
- Remove and Delete image use the danger variant with one verb; plain wording instead of raw ids; correct the design-system doc about the toolbar.
- Needs your decision: the five-contributor cap is interface-only (server allows 32). Recommend enforcing five in `checkDraftInput` and in the database after a data check.

## Batch 6: tests (cheap, test-only)

Findings C-37, C-38, C-39 (subset), C-26 (subset).

- pgTAP: editor restore and delete denials; submit and return replay, `request_conflict` and note boundaries; publication date: today boundary, daylight-saving dates (2026-03-08, 2026-11-01), clearing after publish, restore of a backdated article, rate-limit replay; public detail and media inactive owner, section, category and contributor cases; real lifecycle functions driven against public RPCs.
- Vitest: draft form tests for the date field (dirty, payload, error, conflict row), review and returned banners, the read-only page, lifecycle failure and retry, save status messages; real confirm and note dialog (focus, empty note, Escape); `getReviewQueue`; lifecycle actions table for all five operations; the byline Eastern tests from Batch 2.
- Acceptance: new tests fail without the corresponding fix where a fix exists.

## Batch 7: staff and roles (owner approved; implemented, reviewed, and pushed)

S2-01 through S2-11 are implemented and committed as `8aa3678` on `fix/staff-role-hardening`; the branch is pushed. S2-12 remains measurement only; a rolled-back synthetic 5,000-member run is recorded in the focused plan. Reported verification gates passed. Independent review found no issues but did not rerun gates. PR creation to `main` remains pending GitHub CLI authentication.

Search budgets (separate suggestion budget, try-lock), tags and profiles read policies (C-10, C-11), public media ETag and 304, layout caching for navigation and footer, slug lock only when the title changes, receipts and revisions retention, env validation and health endpoint, lock-order documentation, dialog focus trap and inert page, save-bar layout at phone widths. Each needs a short design note or a measurement before code.

## Decisions (resolved)

All open decisions were resolved for the long term and recorded in [ADR 0014](../decisions/0014-review-follow-up-decisions.md). The questions below are kept for traceability; the answer for each is in the ADR (1 restore re-check: yes; 2 contributor cap: server-enforced at five with grandfathering; 3 caching: yes with on-demand revalidation; 4 retryable code: yes; 5 erasure: anonymize).

1. Restore of a backdated article: re-check the date? (recommended yes)
2. Five-contributor cap: enforce on the server? (recommended yes after a data check)
3. Caching the navigation and footer for about 60 s (trade-off: an archived story's footer link can linger up to a minute).
4. A retryable result code for deadlocks (new API code, needs approval).
5. Erasure policy for Auth users (C-19).

## Estimate

Batches 1 to 4 are small (about a day). Batch 5 and 6 are a day each. Batch 7 items are each half a day to two days.

## Additions from areas 6 to 9 and 12

Findings are in [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md) (IDs D-01 to D-28). Same rules as above.

### Batch 1b: urgent bugs found in these areas (one small migration plus interface fixes)

- C-40 (confirmed on a phone): let the save bar's button row wrap and set `min-width: 0` on the bar, so Save stays on screen at 320 and 375 px with four buttons; check with a browser at both widths. Cheap CSS fix; do it first.

- D-01: add `article.submitted`, `article.returned`, `article.image_purged` (and a decision on `article.owner_changed`) to the audit reader's TypeScript enum, labels and filters from one shared constant, and add a parity test between the SQL reader's action list and the TypeScript schema. Acceptance: the Article activity page loads with those events present.
- D-02: when the contributor combobox text differs from the selected person's label, revert the text on blur (or block Save with a message); "Add contributor" adds an empty row and requires a choice. Tests for both.
- D-03 and D-04 are deferred. See the [taxonomy entries in the deferred register](DEFERRED.md#deferred-from-areas-6-to-9-and-12).

### Batch 3b: cheap hygiene

- D-11: one shared rule rejecting `\p{Cf}` (and U+2800, U+3164) in names, biographies, site text and invitation names, in zod and SQL together; also covers S2-08. D-12: lock source and target tags in one ordered statement in `manage_tag`. D-13: check the actor and rate limit before taking the global advisory locks in the profile functions. D-14: also revalidate public author pages after a profile save.

### Batch 5b: cheap interface and documentation fixes

- D-16/17/19: add the article-body link underline rule, delete the dead `admin-list` CSS, add a title template and per-page dashboard titles, add one reduced-motion rule at the reader surface, correct the design-system doc (sticky toolbar, motion, keyboard moves), and correct the stale taxonomy, contributor and homepage API docs (D-27).

### Batch 6b: tests

D-22 to D-26: taxonomy, homepage, credits and profiles, and site information and audit denials per role, published-article merge and delete, public null-slug assertions, audit-event assertions per action, URL and text boundary tables, race tests, page tests for the site and members-audit pages, and rewriting 056, 057, 027 and 058 to use per-run names and relative counts. Prefer editing one file per area.

### Decisions (new, resolved)

Resolved in ADR 0014: 6 filler is never saved as picks; 7 profile moderation yes; 8 tag redirects yes; 9 credits keep the review as the control; 10 caps yes; 11 audit immutability trigger yes.


6. Homepage editor baseline: should automatic filler stories become permanent picks on save? (recommended: no; show filler as read-only automatic and save only chosen picks.)
7. Member profile moderation: add an administrator-only function that blanks a member's bio, resets the name and hides the page, and hide a profile when its membership is deactivated? (recommended yes.)
8. Tag merge and delete: add redirects from retired tag URLs (a public URL change) or accept 404? (recommended: redirects, as the docs already describe.)
9. Authors crediting real members: require the member's confirmation, or limit non-owner credits to account-less rows the author created? (recommended: limit to account-less rows.)
10. Caps: a per-member limit on new tags and on unattached one-off credits, with cleanup of orphans? (recommended yes; cap 30 per day per member as a starting point.)
11. Audit immutability trigger on `audit_events` (blocks the owner and service role too)? (recommended yes.)

## Additions from the gap lenses

Findings are in [GAP-LENSES-REPORT.md](GAP-LENSES-REPORT.md) (G-01 to G-19). Same rules as above.

- Batch 1c (cheap, small): G-10 publication date floor in both layers and the date shown in the publish confirmation (my feature); G-02 memoize `getCurrentAccess` per request with React `cache()` (cuts about 12 round trips per editor open to about 3); G-16 reword the unfiltered empty state and keep filters in the retry link. G-13 is deferred. See the [gap lens entries in the deferred register](DEFERRED.md#deferred-from-the-gap-lenses).
- Batch 3c (one migration with D-13): G-03 check the administrator before taking the global advisory lock and before replaying a receipt in the homepage and taxonomy functions; G-04 give the review queue separate limits for drafts and publications (newest first) and show a note at the cap; G-12 control-character rule in `ensure_tag` and a 100-section cap; G-11 explicit character lists in SQL with shared parity cases (with D-11).
- Batch 5c (interface): G-05 base the cleanup status on the freshness of the last healthy check and fix the retry button with try/finally and distinct messages; G-06 escape instead of reject search text (My articles and admin list), keeping the filter form on error; G-14 one deletion confirmation pattern with the shared danger button and disabled controls after success.
- Batch 6c (tests): G-17 tests for the review page, `review-queue.ts`, media cleanup page and control, and the letters pages; an astral-character length test to settle G-01.
- Plan, measure first: G-07, G-08, G-09 (EXPLAIN at 50,000 articles), G-15 stable letters slug.
- G-15 decided: key the page by a stable section slug and block renaming it (ADR 0014, decision 12).
