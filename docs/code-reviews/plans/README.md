# Media review plans

One plan per reviewer report, implemented on branch `fix/media-review-hardening` (worktree `/private/tmp/the-gavel-uiux`). Findings are defined in [../REVIEW-REPORT.md](../REVIEW-REPORT.md); batch ordering in [../IMPLEMENTATION-PLAN.md](../IMPLEMENTATION-PLAN.md).

## Decisions taken (chosen for security and performance; the owner delegated them)

1. Unfinished uploads (`pending`/`uploading`) are reaped after 24 hours, because they are never visible and hold private bytes. Finalized-but-unused images keep the 7-day grace. `submit` is rejected with `conflict` while any asset on the article is unfinished, so review never starts with a half-finished upload.
2. Revision-retained images: add an audited administrator purge (`purge_article_image`) for takedowns of wrong or sensitive images. No automatic retention window (a window would silently delete history the owner approved keeping).
3. Media on published articles is administrator-only. Recorded in ADR 0012.
4. Public profile photos require an active membership. Administrators can remove any photo.
5. Writes to profile photos are rate limited and strictly validated in the database, not only in the server action.
6. The write-only `private.media_expiry_log` is dropped; the cleanup ledger already records each expiry.

## Order

Database migration first (one file, one writer), then server code, then tests, then docs. Verification per slice: typecheck, lint, Vitest, the touched pgTAP files on a database that holds no leftover application data.
