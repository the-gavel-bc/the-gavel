# Owner Article Lifecycle Implementation Plan

**Goal:** Let eligible owners and administrators publish a ready draft now and archive a published article, with checked state transitions and accessible dashboard controls.

**Basis:** The accepted [Phase 4 contract](../specs/2026-11-01-editorial-workflow-design.md) and [Task 6](2026-10-29-phase-four-editorial-controls.md). This branch stacks on Task 5 / PR #32 while it is open.

## Decisions and boundaries

- Add separate `publish_article` and `archive_article` RPCs. Their sole client fields are `requestId`, `articleId`, and `expectedVersion`; the database derives actor, owner, status, timestamps, version, and audit identity.
- Publish requires a supported canonical stored body, active section/category/contributor references, finalized body assets, and a finalized main image with alt text and credit. Reuse Task 5's locked publication-readiness predicate. The database remains authoritative if the form appears ready.
- Archive requires a currently published article and expected version. It does not require publication readiness: an invalid old published row must still be removable from circulation. Archive keeps `published_at` and slug, sets `archived_at`, and advances the version once.
- Changed transitions capture a complete revision, one allowlisted audit event, and a receipt in one transaction. Exact authorized retries return the original status/version/time even after later changes; mismatched request ID use fails. Actor and article locks serialize competing saves/transitions, and reference locks protect readiness after waits.
- Failed, stale, wrong-status, unauthorized, and malformed requests leave article/history unchanged. Keep Phase 3 draft operations and Task 5 published-save receipts compatible. No public read grant, scheduled publication, restore, or deletion is added.
- Dashboard controls use the current private article version. They require explicit confirmation, show pending/error/success status, preserve the request UUID on uncertain results, and disable transitions while edits or image operations are pending. A conflict offers reload. Successful transitions refresh the route; published content remains editable and archived content becomes read-only.

## Review focus

1. Owner/admin may transition; cross-owner, credited non-owner, inactive and anonymous callers cannot. Direct table writes stay closed.
2. Unready draft, unsupported body, stale version, wrong status, forged command fields, and changed request replay fail safely.
3. Publish and archive keep slug/owner fixed; archive preserves original `published_at`; no anonymous article read appears.
4. Concurrent save/publish/archive calls serialize and recheck version, status, actor and selected references after locks. A failed business stage rolls back revision, audit and receipt.
5. Lost-response retries retain the exact command. UI conflict recovery cannot silently discard unsaved input; confirmation, keyboard focus, and mobile layout remain usable.

## Slice A: Database transitions

**Files:** New forward migration, focused pgTAP, generated database types and concurrency proof.

- [x] Write failing SQL tests for readiness, positive/denied roles, stale/wrong status, exact and mismatched replay, immutable fields, and atomic history.
- [x] Extend private receipt operation constraints additively; implement two narrow fixed-search-path authenticated RPCs with checked locks and complete revision/audit capture.
- [x] Run focused and full pgTAP, schema lint/type drift, and independent-session race checks.

## Slice B: Checked action and controls

**Files:** New lifecycle contract/action and dashboard control modules; existing private article form/detail route; focused unit/component and desktop/mobile browser tests.

- [x] Add strict server action parsing and safe result validation for the two RPCs; revalidate private dashboard/article paths only after confirmed commit.
- [x] Add publish/archive buttons with confirmation, pending and error states, exact retry, conflict reload, and status-aware route refresh. Block transition while the form or media has unsaved/pending work.
- [x] Verify owner/admin publish/archive, unready draft, wrong-role and cross-owner denial, keyboard/mobile behavior, and read-only archived route.

## Slice C: Handoff

- [x] Update API, data, security, component, testing, README, and STATUS only where this task changes implemented behavior.
- [x] Run affected unit, SQL, contract, concurrency, type, lint, format, production build, and focused browser gates. Review the completed diff once, address findings, and open a Task 6 PR stacked on #32.

**Acceptance:** Ready owner/admin drafts publish once; owned/admin published articles archive once. Invalid or unauthorized transitions fail without state/history changes. Exact retries are stable; status controls and conflict recovery are accessible. Human maintainer review and hosted CI remain external checkpoints.
