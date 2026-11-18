# 0012: Editor role and review as draft state

- Status: Accepted
- Date: 2026-11-19
- Related requirements: [product requirements](../product-requirements.md#roles), [plan](../superpowers/plans/2026-11-19-editor-role.md)
- Supersedes: the "authors publish immediately" MVP rule

## Context

Authors should submit work for a copy editor to check and publish. That needs a third role and a way to mark a draft as waiting for review.

## Decision

Add `editor` to `app_role`. Represent review as `articles.review_requested_at` (plus `review_note` and `published_by_profile_id`) on drafts instead of a fourth `article_status`. Every authority check goes through one private predicate, `private.article_authority`, which replaces the inline `owner or administrator` conditions in the save, media, and lifecycle functions. Submit and return join the existing checked transition function so they inherit versioning, receipts, locking, revisions, and audit.

## Alternatives considered

- A fourth article status touches every published-only filter, check constraint, and public projection for no extra safety.
- Interface-only gating would be bypassable through Supabase directly.

## Consequences

- Authors lose publish, archive, and published-edit rights; existing authors keep their drafts and must submit them.
- Editors cannot edit published articles; administrators can. Editors archive only what they published (`published_by_profile_id`; older publications have none, so only administrators archive them).
- Older tests that published as an author now act as administrator; `067_editor_role_review` covers the matrix.

## Media review follow-up (2026-11-20)

Decisions taken after the media review (see [plans](../code-reviews/plans/README.md)), chosen for security and performance:

- Media changes on published articles are administrator-only; authors and editors change media only on drafts they may edit. This was already the effect of the `edit` mode and is now recorded as a decision.
- Unfinished uploads are reaped after one day; finalized unused images after seven. Submit is refused while an upload is unfinished.
- An audited administrator purge (`purge_article_image`) removes an image that only revision history references, for takedowns. No automatic retention window.
- Public profile photos require an active membership; administrators can remove any photo.
- `article_authority` deliberately does not check Auth eligibility; callers hold that precondition and the pgTAP scan test `069` guards the callers. Doing it in the predicate would turn an ineligible identity's "forbidden" into "not_found".
- `save_*` and the lifecycle function evaluate the predicate in a `WHERE ... FOR UPDATE`; after a wait the version check, not the predicate, rejects stale writes. Accepted: tested by the versioned conflict cases.
