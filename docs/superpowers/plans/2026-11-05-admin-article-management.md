# Administrator Article Management Implementation Plan

**Goal:** Give active administrators a bounded view of all articles and a checked way to restore publication-ready archived articles.

**Basis:** Accepted [Phase 4 editorial contract](../specs/2026-11-01-editorial-workflow-design.md), [Phase 4 Task 7](2026-10-29-phase-four-editorial-controls.md), and Task 6 lifecycle boundary. This branch stacks on Task 6 / PR #33 while PRs #32–33 remain open.

## Decisions and scope

- Reuse the user-scoped Supabase client and existing article RLS. Every admin route and query checks active administrator access independently; a forged URL or cursor cannot upgrade an author.
- Admin list uses keyset pagination ordered by `updated_at DESC, id DESC`, page size 20 (maximum 50), optional status and bounded title search. Cursor binds the applied filter/search so changing them starts a new page. Rows contain only ID, title, status, owner display name, section name, version and update time; no body, excerpt, private Auth link or audit payload.
- Admin detail shows the same safe summary. Draft/published rows link to the existing guarded private editor. Archived rows offer restore only. Missing and RLS-hidden IDs share a not-found view; a failed read exposes no raw database error.
- Restore is a separate `restore_article(articleId,expectedVersion,requestId)` RPC, implemented by extending the private transition helper in a forward migration. Active administrators only. It requires archived status and locked publication readiness; clears `archived_at`, retains original `published_at` and slug, increments version once, and atomically writes a complete revision, `article.restored` audit and exact retry receipt. An old invalid archive stays archived.
- A lost response keeps the exact restore command for retry; later access denial cannot discard the retry handle. Conflict offers reload. Pending restore blocks duplicate submissions. No direct status write, public read, draft repair, or deletion is added.

## Review focus

1. Active admin can list and restore; author, credited non-owner, inactive and anonymous callers cannot access admin data or restore through direct RPC.
2. Forged UUID, status/search/cursor, changed filters with old cursor, stale version and wrong status fail safely without leaking rows or changing history.
3. Restore rechecks body, references and finalized main/body images after locks; invalid old archived content remains archived, with no revision/audit/receipt.
4. Exact retry replays original status/version/time even after later archive; mismatched request reuse fails. Restore/save/archive races serialize and recheck state.
5. List, detail, empty/error, confirmation, keyboard and mobile states show only safe summaries; My Articles stays owner-filtered.

## Slice A — restore boundary

- [x] Write failing pgTAP for admin success, author/anon/inactive denial, readiness, wrong status/stale version, exact replay, rollback, immutable publication identity and old publish/archive compatibility.
- [x] Add forward migration extending receipt operation checks and `private.transition_article`; grant only the narrow authenticated restore wrapper. Regenerate types.
- [x] Run focused pgTAP and one independent-session race proof.

## Slice B — checked action and admin reads

- [x] Reuse strict lifecycle command/result parsing in the restore server action; only confirmed success revalidates private paths.
- [x] Add bounded admin list/detail query contract and server guard. Validate cursor/status/search before read, bind cursor to filters, select only safe columns, and map owner/section labels without exposing private identity links.
- [x] Add focused unit/query tests for role denial, pagination, filter/cursor validation, safe projection, bad responses and network failure.

## Slice C — dashboard and handoff

- [x] Add admin article list, status filter/title search, pagination, safe detail and archived restore control. Include confirmation, busy/error/success, exact uncertain retry and conflict reload.
- [x] Add desktop/mobile browser journeys for admin list/detail/restore, denial, empty/filter states and keyboard action. Keep existing My Articles owner-filtered.
- [ ] Update only affected API, component, security, testing, README and STATUS docs. Run relevant unit, SQL, type, lint, format, schema, generated-type, concurrency and browser gates once; review final diff; open stacked PR against Task 6.

**Acceptance:** An active administrator can find every article and restore a ready archive once. All unauthorized, malformed, stale and unready requests fail without data or history changes. The dashboard remains accessible on desktop and mobile. Human review and hosted CI remain external checkpoints.
