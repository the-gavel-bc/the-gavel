# Administrator Article Audit Implementation Plan

**Goal:** Let active administrators inspect recent article activity without exposing raw audit rows or private identity links.

**Basis:** Accepted [Phase 4 contract](../specs/2026-11-01-editorial-workflow-design.md) and [Task 8 boundary](2026-10-29-phase-four-editorial-controls.md). Tasks 6–7 reached `main` through PR #35 before this task's PR.

## Decisions and scope

- Add one authenticated, `security definer` read function. It verifies the current caller with `private.is_active_administrator()`, returns only the five implemented article actions, a profile display name or `Former member`, resource ID, and timestamp. The raw actor Auth ID and correlation ID stay server-side.
- Keyset order is `created_at DESC, id DESC`. Page size defaults to 20 and is capped at 50; the database may return one extra sentinel row. An optional action filter is one of the five implemented actions. A versioned cursor binds the action filter; malformed or mismatched cursors fail before a database request. The database also caps and validates direct RPC arguments.
- The route and query each check active administrator access. Article IDs link to the existing guarded admin detail route; a missing or archived article keeps its audit event visible. No revision snapshot, article body, or raw audit metadata appears in the page.
- Keep Task 8 read-only. Later administrator mutation tasks own their own audit actions, labels, and schema changes.

## Slice A — database read boundary

- [x] Add pgTAP coverage for admin read, anonymous/author/inactive denial, action and limit validation, deterministic pagination, and retained archived-resource rows.
- [x] Add a forward migration with the bounded read function and a supporting order index. Grant `execute` only to `authenticated`; retain existing direct-table RLS and write denials.
- [x] Run focused SQL checks and regenerate database types.

## Slice B — server query and dashboard

- [x] Add strict action/cursor parsing, safe result mapping, and a generic database-failure message. Unit tests cover role denial, malformed inputs, bounded RPC arguments, safe output, and cursor/filter binding.
- [x] Add an administrator audit page with native action filter, semantic event list, UTC timestamps, and keyboard-accessible next-page link. Unit and desktop/mobile browser tests cover success, empty, invalid cursor, and denial.

## Slice C — handoff

- [x] Update affected API, data, component, security, testing, README, and STATUS text to distinguish this implemented read from future administrator controls.
- [x] Review the final diff once; commit in small coherent slices and open [PR #36](https://github.com/dylandrozario/the-gavel/pull/36) against `main`. Relevant SQL, unit, type, lint, format, generated-type, build, and focused browser checks passed.

**Acceptance:** Active administrators can browse only safe article audit summaries. Authors, credited contributors, inactive members, and anonymous callers cannot obtain the stream, including through a direct RPC. A filter or cursor cannot expand authority or page size. Audit rows remain visible after article archival.
