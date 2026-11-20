# Fix plan for the combined review

Companion to [COMBINED-REVIEW-REPORT.md](COMBINED-REVIEW-REPORT.md). Scope: urgent bugs and cheap fixes only. Everything else is in [DEFERRED.md](DEFERRED.md) with its reason. Status of every item: approval Pending, implementation Not started. Order follows risk: user-visible bugs in this week's code first, then security hygiene, then CI, then tests. Each batch is one small branch and PR, and one migration at most. Rules from `AGENTS.md` apply: authorization, public URL, content lifecycle and destructive migration changes need discussion first, so those are marked "needs your decision".

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

## Batch 7: next, needs design or runtime proof (planned, not scheduled)

Search budgets (separate suggestion budget, try-lock), tags and profiles read policies (C-10, C-11), public media ETag and 304, layout caching for navigation and footer, slug lock only when the title changes, receipts and revisions retention, env validation and health endpoint, lock-order documentation, dialog focus trap and inert page, save-bar layout at phone widths. Each needs a short design note or a measurement before code.

## Needs your decisions

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
- D-03: admin tag list ordered by name with a search box, merge target chosen by a server-side lookup; create-category form loads all sections up to the navigation limit.
- D-04: refuse the protected "Outside of BC" category in the section delete branch (returns `conflict`); pgTAP for both branches.

### Batch 3b: cheap hygiene

- D-11: one shared rule rejecting `\p{Cf}` (and U+2800, U+3164) in names, biographies, site text and invitation names, in zod and SQL together; also covers S2-08. D-12: lock source and target tags in one ordered statement in `manage_tag`. D-13: check the actor and rate limit before taking the global advisory locks in the profile functions. D-14: also revalidate public author pages after a profile save.

### Batch 5b: cheap interface and documentation fixes

- D-16/17/19: add the article-body link underline rule, delete the dead `admin-list` CSS, add a title template and per-page dashboard titles, add one reduced-motion rule at the reader surface, correct the design-system doc (sticky toolbar, motion, keyboard moves), and correct the stale taxonomy, contributor and homepage API docs (D-27).

### Batch 6b: tests

D-22 to D-26: taxonomy, homepage, credits and profiles, and site information and audit denials per role, published-article merge and delete, public null-slug assertions, audit-event assertions per action, URL and text boundary tables, race tests, page tests for the site and members-audit pages, and rewriting 056, 057, 027 and 058 to use per-run names and relative counts. Prefer editing one file per area.

### Needs your decisions (new)

6. Homepage editor baseline: should automatic filler stories become permanent picks on save? (recommended: no; show filler as read-only automatic and save only chosen picks.)
7. Member profile moderation: add an administrator-only function that blanks a member's bio, resets the name and hides the page, and hide a profile when its membership is deactivated? (recommended yes.)
8. Tag merge and delete: add redirects from retired tag URLs (a public URL change) or accept 404? (recommended: redirects, as the docs already describe.)
9. Authors crediting real members: require the member's confirmation, or limit non-owner credits to account-less rows the author created? (recommended: limit to account-less rows.)
10. Caps: a per-member limit on new tags and on unattached one-off credits, with cleanup of orphans? (recommended yes; cap 30 per day per member as a starting point.)
11. Audit immutability trigger on `audit_events` (blocks the owner and service role too)? (recommended yes.)
