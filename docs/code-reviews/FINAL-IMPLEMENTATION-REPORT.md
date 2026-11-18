# Final implementation report: media review

Branch `fix/media-review-hardening` (worktree `/private/tmp/the-gavel-uiux`, based on `feat/editor-role`). Not pushed; no pull request opened.

## Decisions (delegated by the owner, chosen for security and performance)

1. Unfinished uploads are reaped after 1 day; finalized unused images keep 7 days. `submit_article` is refused while an upload is unfinished.
2. Added an audited administrator purge (`purge_article_image`) for images that only history references. No automatic retention window.
3. Media on published articles is administrator-only (recorded in ADR 0012).
4. Public profile photos require an active membership; administrators can remove any photo.
5. Photo writes are validated and rate limited in the database.
6. `article_authority` keeps its documented precondition (callers prove Auth eligibility) instead of checking it itself, because the check would change an ineligible identity's `forbidden` into `not_found`; a pgTAP scan test guards the callers.

## What changed, by finding

| Finding                    | Result                                                                                                                                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 expiry starvation     | Fixed. Candidate query joins draft and published articles; `expiry_attempted_at` rotates failed rows and blocks re-claiming within an hour. pgTAP: 110 archived rows no longer block a live row.                                                                                               |
| F-02 editor media tests    | Done at database level: `068_editor_media_authority` (30 checks across request, attach, remove, admit, trusted begin, inactive and demoted editor, purge). Route tests parametrized for pending, signed-out, author, editor, administrator. Browser (Playwright) test not written: see limits. |
| F-03 unfinished uploads    | Fixed: claimed after 1 day; submit conflicts while unfinished.                                                                                                                                                                                                                                 |
| F-04 slot starvation       | Fixed: the body read has a 15 s deadline (408), releasing the slot.                                                                                                                                                                                                                            |
| F-05 profile photos        | Fixed: processing gate and `rate_limited` in the action; strict WebP check, rate limit, active-membership requirement in the database; `admin_remove_profile_photo`; row-level security on `private.profile_photos`.                                                                           |
| F-06 docs                  | Fixed in api-contracts, security-and-permissions, data-model, ADR 0012; new runbook.                                                                                                                                                                                                           |
| F-07 cleanup scale         | Index on the ledger claim ordering (planner uses it: 0.3 ms for the first 100 of 20,000 keys); finish calls capped at 10 concurrent; write-only `media_expiry_log` dropped. The re-sweep-forever policy is unchanged and is still a documented limit.                                          |
| F-08 race tests            | `scripts/draft-concurrency/unused-expiry-races`: claim versus attach (both lock orders), unfinished upload claim, two simultaneous begins. All pass.                                                                                                                                           |
| F-09 cron/denial tests     | `cron-auth.test.ts` table; cleanup actions deny author and editor.                                                                                                                                                                                                                             |
| F-10 authority hardening   | `private.can_use_asset` is the single uploader-or-administrator rule; `069` scans that every media and article function uses the predicate and none compares the owner inline.                                                                                                                 |
| F-11 Origin check          | Added to the upload POST (403 on a cross-origin browser request).                                                                                                                                                                                                                              |
| F-12 Storage shapes        | Table test of empty success, error, and thrown failure; a thrown Storage error is now a failed removal, not a crashed run.                                                                                                                                                                     |
| F-13 database test hygiene | `test:db:clean` script; the stale `034` assertions for a deliberately removed RPC were deleted; `001` now expects the editor role.                                                                                                                                                             |
| F-14 dead code             | Reviewer was wrong about a TypeScript action (none exists); only the RPC remains, with database tests, and is documented. No change.                                                                                                                                                           |
| F-15 handoffs              | Verified archived articles leave the homepage (`is_homepage_card_eligible` requires published). Preview-deployment cron coverage left as is.                                                                                                                                                   |
| Decision challenge         | Implemented as the audited purge above.                                                                                                                                                                                                                                                        |
| TEST-002                   | Rejected earlier (the cancel path is `mark_article_image_for_removal`).                                                                                                                                                                                                                        |

## Verification actually run

- `pnpm typecheck`, `pnpm lint`: pass.
- `pnpm test` (Vitest): 170 files, 1,158 tests pass.
- pgTAP, whole suite, on the local database with leftover application data cleared: all files pass except `027_own_profile`, `056_live_site_taxonomy`, `057_ensure_tag`, `058_guest_contributors`. Those four also failed before this work and depend on leftover local data (taxonomy rows I had to clear, profile names, ineligible-identity fixtures). They were not run against a freshly reset database; run `pnpm test:db:clean` for a clean signal. The new files `064`, `066`, `067`, `068`, `069` pass.
- `scripts/draft-concurrency`: the new file (4 tests) and `media-removal-races` pass against the local database (the script now accepts `GAVEL_DB_CONTAINER`).
- `pnpm build` (production) passes after these changes; generated database types were regenerated from the migrated database.
- Not run: the Playwright suite, the other concurrency scripts, `pnpm db:types:check`.

## Remaining limits

- No Playwright test for the editor upload flow (needs an editor account in the e2e fixtures).
- `purge_article_image` has no screen; it is a database tool documented in a runbook.
- Re-sweeping every retired key daily is unchanged; revisit when the ledger is large.
- `list_unused_article_uploads` remains as a database function with no interface caller.
- Raw per-reviewer reports were not saved.
