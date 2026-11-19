# Deferred and open review items

Items found by a review that were deliberately not done, with the reason, so they are not lost. Update this file when an item is done, rejected, or re-decided. Source reports: [REVIEW-REPORT.md](REVIEW-REPORT.md) (media), [AREA-1-AUTH-REPORT.md](AREA-1-AUTH-REPORT.md) (authentication and access).

| Area | Item | Why not done | What would settle it |
| --- | --- | --- | --- |
| Media | Browser (Playwright) test of the editor upload flow | The e2e fixtures have no editor account, and the suite needs the isolated local Supabase on port 54321 | Add an editor user to the e2e fixtures; test: author submits, upload control locked; editor uploads on the submitted article |
| Media | Screen for `purge_article_image` | Rare takedown tool; the owner accepted a database-level tool for now | Runbook `docs/runbooks/purge-article-image.md` is written; build an admin screen if takedowns become routine |
| Media | The daily cleanup still re-sweeps every retired key forever | Indexed and concurrency-capped, but the policy change (stop re-sweeping old successes) needs real ledger sizes | Revisit when the ledger holds tens of thousands of keys; measure a full sweep against its 40 s budget |
| Media | `list_unused_article_uploads` has no interface caller | Kept as a documented database function with tests; removing it is a separate migration | Drop the function and its tests if no screen is planned |
| Media | Raw per-reviewer reports for the media run were not saved | The first run captured them in chat only | Later runs save raw reports under `docs/code-reviews/raw/` in the reviewer's checkout |
| Auth | Session expiry mid-edit reads as lost access (LOGIC-002) | A full fix needs a distinct signed-out result in every draft action and a preserved redirect target; only a message hint was added | Add an `unauthenticated` result code, pass a validated `next` through sign-in |
| Auth | Google `hd` claim is never verified (SEC-002) | Depends on what Google sends for non-Workspace accounts with a bc.edu address; cannot be settled from the code, and requiring a missing claim would lock people out | In staging, sign in with such an account and inspect `auth.identities.identity_data`; then require `hd` if present |
| Auth | `/api/session/desk` forwards junk-cookie requests to Supabase Auth (SEC-004) | No data exposure; the proper control is a platform rate limit | Add a Vercel firewall rate limit for that path |
| Auth | Dashboard nav may not update after a mid-session role change (LOGIC-005) | Needs a runtime check; every page and action rechecks, so there is no access gain | Playwright with two contexts: demote in one, navigate in the other |
| Auth | Invite form hint for skipped (already listed) addresses (LOGIC-004) | Copy on the access-pending page was fixed; the form hint touches the staff UI | Show "already a member, reactivate from the list" for skipped entries |
| Auth | Admin page unit tests for homepage, media cleanup, site, taxonomy, members audit (TEST-002) | Large test-only batch; guard tests for the actions were done first | One denial test per page (author, editor, pending) |
| Auth | `claim_invitation` pgTAP branches, revocation-mid-session browser test, eligibility parity table, CSP header e2e assertions, dashboard layout nav test, sign-in and access-pending tests (TEST-003 to 010) | Test-only; lower risk than the fixes, and several need the e2e stack | See AREA-1-AUTH-REPORT.md for each assertion |
| Local database tests | pgTAP files `027`, `056`, `057`, `058` fail on the long-lived local database | They depend on leftover local data and fixtures (profile names, taxonomy rows, ineligible identities); they failed before this work | Run `pnpm test:db:clean` on a freshly reset database |
| CI | (Resolved) The dependency scan failure on `picomatch` (GHSA-fc5q-39xc-vjpf) | The registry no longer returns that advisory and `pnpm audit` passes. The only advisories left are two moderate ones in production `next` (patched in 16.4.5) and one dev-only `minimatch`. | Bump `next` and `eslint-config-next` to 16.4.6 (COMBINED-FIX-PLAN.md batch 4) |
| Staff | All area 2 findings | Review only so far; see [AREA-2-STAFF-REPORT.md](AREA-2-STAFF-REPORT.md) | Owner approval of the batches in that plan |
| Publication date | Playwright flow (create a draft with a past date, submit, publish as editor, see the date on the public page) | Owner said not to worry about browser tests; the whole browser suite is already red and deferred | Add the spec when the browser suite is repaired; database and unit coverage exist (pgTAP `070`, contract and field tests) |
| Editor (mobile) | An automated tap on Save in an iPhone 13 viewport right after editing the date field was reported as blocked by the tag entry row | Not reproduced by a direct hit test (the Save button is the top element at rest and after scrolling; only the save bar has a stacking order); likely an automation scrolling artifact, but unconfirmed | Try on a real phone or the simulator: edit the date, then tap Save |

## Deferred from the combined review (areas 3, 4, 5, 10, 11)

Everything the fix plan does not cover. Source: [COMBINED-REVIEW-REPORT.md](COMBINED-REVIEW-REPORT.md); IDs refer to it.

| ID | Item | Why deferred | What would settle it |
| --- | --- | --- | --- |
| C-08 | Distinct codes and messages for submit conflict, readiness failures and over-long return notes | Needs new error codes in the public contract, which need approval | Decide codes; map them in the lifecycle controls |
| C-10, C-11 | Restrict the anonymous `tags` read and the `profiles` read policies | Policy changes that affect public tag pages and member lookups; need a design and tests first | Serve the tag page through a definer function requiring a published article; split the profile policy into member and public |
| C-12 | Separate search and typeahead budgets, try-lock, per-IP edge limits | Database change plus a platform firewall rule; needs a measurement of real traffic | Give suggestions their own budget; add Vercel firewall rules for the search, suggestion, sitemap and media paths |
| C-14 | Shorter public cache for takedowns, magic-byte check on photos, cache-bypass by query string | Trade-off against CDN load | Decide the takedown window (about 60 s) and add the check |
| C-16, C-17, C-18, C-20 | Lock-order documentation and fixes, slug lock only when the title changes, revision and receipt retention, a shared stored-input helper | Each needs a design note and concurrency tests | Write the global lock order in docs/architecture.md first |
| C-19 | Erasure policy for Auth users (about 12 restrictive foreign keys) | Owner decision | Decide cascade versus runbook for audit and revisions |
| C-21 | Permanent legacy-slug compatibility branches; audit-action constraint revalidation under lock | Low risk now | Add a dated removal note; use `not valid` then `validate` for the next action |
| C-22 | Resized image variants, `srcset` and `sizes` | Large feature | Generate 480 and 960 px variants at finalize and serve them through the authorized route |
| C-23, C-24 | Cache navigation and footer; ETag and 304 on public media | Needs your decision on a 60 s staleness window; ETag needs a design | See COMBINED-FIX-PLAN.md decisions |
| C-25 | Slow-query suspects (tag, author and category scopes, detail double validation, typeahead LIKE) | No measurement yet | `EXPLAIN (ANALYZE)` against about 5,000 seeded articles before changing |
| C-26 | A database-backed Vitest suite that parses real anonymous RPC output with the production schemas; run the two public-search scripts in CI | Needs a CI database step | Parameterize the scripts and add them to CI |
| C-27 | Repair the 13 stale browser specs and add an editor fixture | About 2 days; needs the isolated local stack | Shared confirm-dialog helper, admin actor, one-off credits, editor user (diagnosis per spec is in the area 11 report) |
| C-29 | Runbooks (backup and restore, rollback, incident, secret rotation), release procedure for migrate-then-deploy, health endpoint and cron alerting, hosted Supabase and Vercel settings | Mostly dashboard and process decisions; the Supabase plan and point-in-time recovery are undecided | Decide the plan; write and rehearse a restore |
| C-31 | Dialog focus trap and inert page; browser Back guard in the editor; one in-page confirm everywhere | Needs a design for the guard and runtime testing | Prefer a native `dialog` element; handle `popstate` |
| C-33 | Save-bar phone layout, visible reason for disabled Submit and Publish, linked recovery panel, focus after success | Needs a runtime check at 320 and 375 px | Real phone or simulator check, then adjust |
| C-35 | Refactor the upload pipeline duplicates and the 587-line draft form | Larger refactor with regression risk | After the test batch lands |
| C-36 (rest) | Toolbar roving focus and headings, typed-but-not-added tag text, field error styling, body-image form collapse | Polish with design choices | Group into a design-system pass (area 12) |
| Areas 6 to 9, 12 | Homepage curation, taxonomy and tags, profiles and credits, site information and audit, design-system sweep | Not reviewed yet | Run the same quick review |

## Decided not to change (so they are not re-raised)

| Area | Item | Decision and reason |
| --- | --- | --- |
| Media | `save_*` and the lifecycle function evaluate `article_authority` inside a `WHERE ... FOR UPDATE` (ARCH-008) | Accepted. After a lock wait the expected-version check, not the predicate, rejects stale writes; covered by the versioned conflict tests. Recorded in ADR 0012. |
| Media | `article_authority` does not itself check Auth eligibility (SEC-005) | Accepted with a documented precondition: callers prove eligibility, because checking inside would turn an ineligible identity's `forbidden` into `not_found`. Guarded by pgTAP `069`. Recorded in ADR 0012. |
| Media | Reviewer claim that editors cannot cancel uploads (TEST-002) | Rejected: the cancel path is `mark_article_image_for_removal`, which uses `article_authority`. |
| Media | Reviewer claim of a dead `listUnusedArticleUploads` TypeScript action (LOGIC-006) | Rejected: no such action exists; only the database function remains (see the table above). |
| Media | Cleanup and expiry cron routes return 404 outside production (preview deployments have no coverage) | Left as is: scheduled deletion jobs must not run against preview data. Revisit only if a staging environment with real storage is added. |
| Media | Media changes on published articles are administrator-only | Decided (owner delegated, chosen for security): recorded in ADR 0012. |
| Auth | Submit-for-review rule differs between SQL (any owner) and the interface (authors only) | Decided: leave SQL permissive (harmless, owner only) and offer submit to authors only, since editors and administrators publish directly. The permission matrix now says "not needed". |

## What each review implemented

- Media (quick run, 4 reviewers): every finding that was verified real was implemented, except the items in the first table. Nothing was skipped for being low impact; the deferred items were deferred for dependencies (e2e stack, real data sizes) or because they need an owner decision.
- Area 1 (authentication and access): the real defects were fixed (editor read scope, callback errors, lost claim race, wording). The remaining Low and test-only findings were deferred and are listed above; none of them is a security gap.
- Area 2 (staff and roles): reviewed only; nothing implemented yet. See AREA-2-STAFF-REPORT.md.
| CI | Browser (Playwright) suite is red on the stack tip (#117 run, both desktop and mobile): `admin-audit`, `admin-deletion`, `admin-homepage`, `admin-members`, `article-lifecycle`, `article-media`, `create-drafts`, `draft-conflict-recovery`, `draft-selections`, `edit-drafts` (published editable), `published-edit`, `public-authors` (guest credits), and `public-search` (resource 404 without JavaScript) | The specs predate the desk redesign (in-page confirmations replacing `window.confirm`, new buttons and layout, one-off credits replacing guest contributors, the editor role so authors no longer publish or edit published articles, staff email list). Updating them needs the isolated local Supabase on port 54321 and iterating on selectors; it was not attempted. The body-images mobile failure (sticky toolbar covering the button) was a real bug and is fixed. | Reset a local stack (`supabase start`), run `pnpm test:e2e`, update each spec to the current UI and roles (authors submit, editors or administrators publish), and add an editor user to the fixtures |
