# Phase 5 public reader — integrated verification and handoff

Task 23 record for the [Phase 5 plan](../superpowers/plans/2026-11-09-phase-five-public-reader.md), written 2026-11-11 against `origin/main` `f46c988` plus the open Task 22 branches (`feat/site-social-links` PR #85 and `feat/phase5-visual-reconciliation`). It separates what is implemented and locally verified from what still needs hosted, human or owner action. **The MVP is not declared deployable.**

## What Phase 5 delivered

| Area                                              | PRs                     |
| ------------------------------------------------- | ----------------------- |
| Plan and public-read contract                     | #49, #50                |
| Detail, listing and navigation projections; media | #51–#55                 |
| Reader styling, shell and homepage                | #56–#59                 |
| Safe body renderer and article page               | #60, #61                |
| Section, category, letters, tag and author pages  | #62–#64                 |
| Search index, bounded search and search page      | #65–#67                 |
| About/submission pages, metadata, sitemap/robots  | #68–#70                 |
| Post-merge review and its fixes                   | #71–#82 (record in #72) |
| Accepted 404 deferral                             | #83                     |
| Browser security headers and nonce CSP            | #84                     |
| Task 22: social-link settings (open)              | #85                     |
| Task 22: screenshot reconciliation, accessibility | this branch             |

The [Phase 1–5 PR review](phase-1-5-pr-review.md) records every finding and its fix. All 29 numbered findings and optimizations O1–O5 have merged fixes.

## Verification performed

Evidence lives in each task's plan; this section lists what Task 22/23 ran in addition. Every local run used a disposable Supabase project, never the primary local project.

- **SQL (PR #85 head):** 69 files / 2,086 assertions passed, including new site-link cases. Schema lint showed one warning that already exists on `main` (`manage_membership`, unused variable).
- **Unit (this branch):** 144 files / 1,001 tests passed, plus 3 new social-link/footer tests. Typecheck, lint and format passed.
- **Production build, desktop 1440px and mobile 375px:**
  - The homepage matches the owner's nine desktop screenshots in structure: logo masthead, centered uppercase navigation with category dropdowns, overlaid lead hero with three thumbnail stories, blue Featured band, section rows with "View All →", Stay Connected, and a three-column footer.
  - One `h1`, no heading-level jumps, every image with alt text, no unnamed links, single main/footer landmarks.
  - Keyboard-operable category dropdown with visible focus; no horizontal scroll at 375px.
  - Fonts served from this origin; no CSP violations on the homepage, archives or search. This caught and fixed an inline-style violation from `next/image`.
- **Publication lifecycle:** one story was checked on its article page, the homepage, its section archive, search, the author page and the sitemap.
  - Published: the article returned 200 and the story was listed everywhere.
  - Archived: the article returned 404 and the story disappeared from all five lists on the next request.
  - Restored: everything came back.
  - A draft slug returned 404 to an anonymous reader.
- **Security headers (#84):** nonce CSP and baseline headers verified with browser checks, including the no-JavaScript sign-in redirect and blocked inline handlers. The `e2e/security-headers` spec runs in CI.
- **Hosted CI:** the owner runs and watches it; it covers the full unit, SQL, contract, editor, concurrency and browser suites. This record claims no hosted result.

Not run locally in Tasks 22/23: the full browser suite (its fixtures target the primary local project), concurrency suites, and a populated-upgrade versus clean-install comparison. Earlier task plans record those runs for their slices.

## Implemented and pending

**Implemented:**

- Anonymous, published-only reader routes: article, homepage, sections, categories, letters, tags, authors, search, About, submission instructions and 404 recovery.
- Bounded projections, safe body rendering and authorized media with the approved five-minute image cache.
- Metadata, sitemap and robots.
- Nonce CSP and browser security headers.
- The owner-approved logo, fonts and social links.

**Pending; these block a launch claim:**

- **Owner inputs:**
  - Production mission, contact, submission and history copy.
  - Spotify/LinkedIn/Facebook URLs.
  - Mobile and non-homepage screenshots for visual signoff.
- **Unresolved MVP contracts:** profile-image upload/editing and approved video providers. The owner must scope or explicitly defer them.
- **Newsletter:** outside approved scope; no link is shown.
- **Accepted, deferred:** the no-JavaScript matched-resource 404 body (Next.js #100596, #83). Review on Next upgrades and before release.
- **Hosted and operational:**
  - Real Google OAuth and session behavior.
  - Disabling email signup in every hosted Supabase project.
  - Environment separation.
  - `CRON_SECRET` and cleanup capacity, health and alerts (real Storage latency sets sweep capacity).
  - Function duration limits (`maxDuration = 60` for cleanup).
  - Production-origin CSP/header and sitemap checks.
  - HSTS `includeSubDomains`/preload once the domain is final.
  - Backup restore and release/rollback exercises.
- **Human review:** maintainer code/security review, screen-reader testing, and accessibility/performance review on real devices.

## Handoff

Phase 5 implementation is complete once PR #85 and the Task 22 PR merge with green hosted CI. The project is **not** deployable until the pending owner inputs, MVP contract decisions, hosted/operational gates and human reviews above are closed.
