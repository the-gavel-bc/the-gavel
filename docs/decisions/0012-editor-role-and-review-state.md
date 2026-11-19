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
