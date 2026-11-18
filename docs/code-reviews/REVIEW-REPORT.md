# Review report: media pipeline (quick run)

Scope: media upload, finalize, removal, expiry, cleanup, profile photos, and how they interact with the new editor role. Code reviewed: `/private/tmp/the-gavel-uiux`, branch `feat/editor-role`, commit `4f6241a`. Reviewers: security, business logic, architecture, testing (Sonnet, read-only). Run by hand because the skill and custom agents were not loaded in that session. Raw per-agent reports were not saved to files; this report carries every finding. Nothing was executed against the database by the reviewers.

## Executive summary

No Critical findings. The authorization chain for upload, finalize, removal and preview holds for author, editor and administrator; every media function's latest definition uses `private.article_authority`, and lock ordering is consistent. The real risks are operational: the nightly expiry job can silently stop expiring anything, unfinished uploads are never reaped (and the new submit-for-review flow creates a new way to strand them), the editor role's effect on media writes has no tests at all, and two image-decoding paths can be starved or abused by signed-in staff. Documentation also contradicts the implementation in several places.

Verification: I re-checked these directly in the code or database, not just from the reports. F-01 is confirmed (candidate query has no article-status filter and a fixed 100-row window). F-04 is confirmed (slot acquired at `route.ts:135` before the body read at `:171`, no timeout). F-05a is confirmed (no processing gate in `src/backend/profiles`). `claim_media_cleanup` has only primary and unique indexes (F-07 premise holds, impact needs measurement). One reviewer finding was rejected (see below). The independent verifier agent was not run, to save cost; the checks above replaced it for Critical/High.

## Findings

IDs are consolidated. Source IDs show where each came from.

### P1

**F-01 | Medium | Confirmed | Expiry sweep can starve (LOGIC-001)**
Where: `supabase/migrations/20261118010000_expire_unused_uploads.sql` (candidate loop); `src/backend/media/unused-upload-expiry/unused-upload-expiry.ts`.
Problem: candidates are the oldest `p_limit * 4` (100) finalized or deleting rows with no article-status filter. Rows on archived articles, locked rows, and rows that keep failing in the TypeScript loop are skipped after selection but stay at the head of the window.
Failure path: after about 100 old unused images on archived articles accumulate, every run's window is all skipped rows, nothing expires, and the job still reports success with `claimed = 0`.
Fix: filter by article status in the candidate query (join `articles` where status in draft, published); keep `skip locked` in the loop; order so failed rows do not sit at the head.
Test: pgTAP with 101 old unused images on an archived article plus one on a draft; the draft image must be claimed. Vitest: one run never re-claims a row that failed earlier in the same run.
Complexity: Small. Regression risk: Low.

**F-02 | High | Confirmed | No tests for the editor role on media write paths (TEST-001, TEST-003, TEST-006)**
Where: `supabase/tests/067_editor_role_review.test.sql` never calls a media function; `src/app/api/articles/[id]/media/[assetId]/route.test.ts:57` and `media-removal.test.ts:31` hardcode `role: "author"`; e2e media specs cover only the owner happy path.
Failure path: a regression in the `'edit'` mode (author can still upload while in review, editor can upload to an unsubmitted or published article, inactive editor allowed) passes every suite. AGENTS.md makes role and ownership denial tests part of done.
Fix: pgTAP for `request_article_image_upload`, `mark_article_image_for_removal`, `admit_article_image_upload`, `set_article_main_image`, `list_unused_article_uploads` and the trusted `begin_`/`finalize_`/`complete_` functions, with actors editor, owner author, other author, inactive editor, across in-review, unsubmitted and published articles. Parametrize the route access mock (inactive, pending, editor). Add one editor e2e (author submits, upload control locked; editor uploads on the submitted article; control gone after return).
Complexity: Medium. Regression risk: Low.

**F-03 | Medium | Confirmed | Unfinished uploads are never reaped and submit can strand them (SEC-003, LOGIC-002, LOGIC-003, ARCH-003)**
Where: expiry claims only `finalized` and `deleting` rows; `begin`/`finalize`/`complete_removal` require `article_authority 'edit'` plus uploader-or-administrator; `docs/api-contracts.md:299` states no claim expiration.
Failure path: an author starts an upload, clicks Submit before finalize, finalize returns `not_found`, the Storage object stays and the row stays `uploading` (or `deleting` if a removal was in flight). The author cannot cancel (edit rights ended), an editor cannot finish it (not the uploader). Only article deletion clears it.
Decision needed: should the 7-day rule also cover unfinished uploads? (Both reviewers assumed yes.)
Fix: extend the claim to `pending`/`uploading` rows older than the window with the same article-status guard; and/or reject `submit` with `conflict` while any asset on the article is `pending` or `uploading`.
Test: pgTAP: an `uploading` asset older than 7 days is claimed and completed; submit with an `uploading` asset returns `conflict`.
Complexity: Small. Regression risk: Medium.

### P2

**F-04 | Medium | Confirmed | Slow uploads can hold both image-processing slots (SEC-001)**
`route.ts:135` acquires one of 2 per-instance slots before `readMediaFile` (`:171`), which has no deadline. Two trickling uploads by one signed-in member make everyone else's uploads return 503 on that instance. Fix: read the body under a deadline, or read before acquiring and gate only the decode. Test: a never-ending stream aborts within the deadline and releases the gate.

**F-05 | Medium | Mixed | Profile photo path (SEC-002, ARCH-007, LOGIC-005)**
a) Confirmed: `saveProfilePhotoAction` decodes up to 24 megapixels with no processing gate and no per-actor limit.
b) Probable: `set_own_profile_photo(bytea)` is executable directly by any authenticated member and checks only size and RIFF/WEBP header bytes, so the server re-encode can be bypassed; no rate limit or receipt.
c) Confirmed by reading: deactivating a membership leaves `profiles.active` true; `get_public_profile_photo` checks only profile active and linked, and `remove_own_profile_photo` needs an active membership. A removed member's photo stays public and no one can take it down.
Fix: reuse the processing gate and an attempt quota; tighten the header check or route writes through a service-role path; require an active membership in the public read and/or add an administrator remove-photo RPC. Defense in depth: enable RLS on `private.profile_photos`.

**F-06 | Medium | Confirmed | Docs contradict the implementation (LOGIC-004, ARCH-002)**
`docs/api-contracts.md:44,172,287,299`, `docs/security-and-permissions.md:5,333,345`, `docs/data-model.md:130` still say owners and administrators manage media on draft or published articles, that uploading claims cannot be marked, and that there is no automatic expiry. Reality: non-administrators can edit only drafts (editor role plan), editors have access while in review, and expiry runs after 7 days. `docs/data-model.md` lacks `review_requested_at`, `review_note`, `published_by_profile_id`, the review index and the new audit and receipt constraints. The narrowing of published-article media to administrators is not recorded as a decision. Fix: replace "owner/admin" with a link to the authority table, drop the stale sentences, add the columns, record the decision in ADR 0012.

**F-07 | Medium | Needs runtime check | Retired-key cleanup revisits the whole permanent ledger (ARCH-001, ARCH-006)**
Each daily run re-claims every ledger key; the claim orders by `last_succeeded is false desc, last_attempt_at nulls first, object_key` with no supporting index (confirmed: only primary and unique keys), then fires 100 parallel finish RPCs per batch. Each expired upload adds a ledger row. If a run cannot finish in its 40 s budget the backlog marks cleanup unhealthy and archived-article deletion is blocked. `private.media_expiry_log` is write-only, unbounded, and duplicates the ledger. Fix: add an index, stop re-sweeping long-succeeded keys, cap concurrency, drop or prune the log. Verify with `EXPLAIN (ANALYZE)` on a 100k-row ledger.

**F-08 | Medium | Confirmed | Race tests for expiry and double upload are missing (TEST-004, TEST-007)**
No two-session test of `claim_expired_unused_uploads` against `set_article_main_image` or a save (both lock orders), or against an editor-uploaded asset; no test of two simultaneous uploads of the same asset or an upload racing a removal. The SQL may be safe; nothing proves it. Add to `scripts/draft-concurrency`.

**F-09 | Medium | Confirmed | Cron and denial tests are thin (TEST-008, TEST-011)**
`refuseCronRequest` has no unit test for a wrong secret of equal length, a different length, a secret under 32 characters, a missing `Bearer` prefix, or non-GET; no editor/author denial test for `cleanup-actions`; no test of the cleanup control component. Table-driven tests, all small.

**F-10 | Low | Probable | Harden the shared authority predicate (SEC-005, ARCH-004, ARCH-005, ARCH-008)**

- `article_authority` checks active membership and profile but not Auth eligibility (the old administrator check did). Safe today because every caller adds it; add the check or a comment, and a test.
- The "uploader or administrator" asset rule is copied in `admit`, `begin`, `finalize` and the route; consolidate into one helper.
- Nothing prevents a later migration from re-copying an older function body with the old owner check; add a pgTAP scan of `pg_proc.prosrc` asserting the media and article functions call `private.article_authority`.
- `save_*` and `transition_article` call the predicate inside `WHERE ... FOR UPDATE`; the version check is the real protection after a wait. Lock first, then check, as the media functions do (Needs runtime check; add a two-session test).

### P3

- F-11 SEC-004 Informational: the cookie-authenticated upload route has no Origin check (relies on SameSite). Needs runtime check.
- F-12 TEST-009: expiry and cleanup tests mock the Storage client; add a table of real Storage error shapes (404 on an already-deleted object).
- F-13 TEST-010: add a `test:db:clean` script (`supabase db reset && supabase test db`); older pgTAP files give false failures on a used database (this review and the editor-role work hit it). Fix the stale renamed-function reference in `034`.
- F-14 LOGIC-006: `listUnusedArticleUploads` and its RPC have no UI caller after the leftover-images section was removed; docs still describe it. Remove or document.
- F-15 Handoffs: confirm an archived article leaves `homepage_selections` (archive and restore do not touch it); cleanup cron returns 404 outside production so preview has no coverage.

## Decision challenge (needs the owner)

ADR 0009 keeps any image referenced by a retained revision until the article itself is deleted. An image once saved onto a published article (a wrong or sensitive photo) cannot be erased without deleting the whole article. Consider a bounded revision-reference retention window or an administrator purge. Not an implementation task until decided.

## Rejected

- TEST-002 (editors cannot cancel or list unfinished uploads because "cancel_unfinished" still uses owner-or-administrator): no public function with that name exists in the database. The cancel path is `mark_article_image_for_removal`, which was rewritten to `article_authority` and accepts `uploading` rows, so editors can cancel on in-review articles. The remaining stranded-upload problem is F-03.

## Not examined

Frontend media components (UI gating only), `retired-media-cleanup.ts` after line 80, the cleanup lease functions and probe, `lock_media_actor` body, public media projection functions, internals of several older pgTAP files, `scripts/media-cache-backfill`. No test suite was run by any reviewer.
