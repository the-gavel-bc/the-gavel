# Editor role and review workflow

Owner decisions (2026-11-19): authors submit drafts; editors copy-edit, publish, or return them; administrators keep every ability. Editors edit only articles in review; administrators edit anything. Editors archive only articles they published. Editors may publish their own articles. Existing authors stay authors without publish rights.

## Design

- `app_role` gains `editor` (own migration, since enum values must commit before use).
- `articles.review_requested_at`, `review_note`, `published_by_profile_id`; no new status.
- `private.article_authority(article, user, mode)` with modes edit/read/replay/submit/review/publish/archive. `can_read_article` and every save/media/lifecycle function call it.
- `transition_article` gains `submit` and `return`; receipts, audit actions, and the audit reader allow them. `list_review_articles()` feeds the queue; `staff_summary` counts editors.
- Interface: `articleCapabilities` mirrors the predicate; the lifecycle controls offer only permitted actions; the editor page shows a read-only view when the member cannot edit; `/dashboard/review` lists submissions and the editor's own publications; staff forms accept the Editor role.

## Risks handled

- Retry and double-submit: submit/return use the existing request receipts and version check; a replay returns the original result.
- Concurrent edit during review: edits require the current version; an editor and an author cannot both write because authors lose edit rights atomically when they submit.
- Role downgrade: the predicate reads the live membership each call.

## Verification

- `supabase/tests/067_editor_role_review.test.sql` (33 assertions) covers the matrix. Older tests that published or edited published articles as an author now act as administrator; one asserting "conflict" for an author editing a published article now expects `not_found`.
- Unit tests: permissions, lifecycle controls, review queue, queries. Typecheck, lint, and the full unit suite pass.
- Many older pgTAP files fail on the long-lived local database because of leftover application data; they fail the same way without these changes. They need a clean database to give a signal.

## Limits

- Older published articles have no recorded publisher, so only administrators can archive them.
- Return notes are plain text, shown to the author on the article and in My articles.
