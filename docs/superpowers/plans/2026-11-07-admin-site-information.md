# Administrator Site Information Implementation Plan

**Goal:** Give active administrators a safe, versioned editor for publication information, without publishing unprovided values.

**Basis:** [Phase 4 design](../specs/2026-11-01-editorial-workflow-design.md) and [Task 14](2026-10-29-phase-four-editorial-controls.md). The owner selected Instagram as the only social link and plain text with paragraph breaks for mission and submission instructions.

## Decisions and risks

- Store only mission, contact email, Instagram URL, and submission instructions; unset values remain null. Text is plain and bounded; URLs require HTTPS and email addresses require a conservative valid shape. Never accept raw HTML or arbitrary keys.
- Use an additive singleton with closed direct access and checked administrator-only read/save RPCs. Preserve all existing data. An expected version prevents lost updates; request receipts preserve exact retries after uncertain responses, and the UI offers explicit conflict recovery. Audit changed saves without copying content. Serialize administrator checks with membership changes.
- Task 13 PR #44 is open independently; its audit allowlist migration precedes this task's migrations. Integrate and recheck the combined migration sequence before merging or deploying both. Rollback removes the editor code while retaining the additive data and receipt tables; destructive data removal requires separate approval.
- Public reading and rendering remain Phase 5. No new dependency or external service.

## Steps and acceptance

- [x] Write focused database and validation tests for field bounds, unsafe input, unknown keys, role denial, no-op, stale version, exact retries, audit rollback and data preservation; add additive storage and RPCs.
- [x] Add strict server reader/action and accessible administrator form with pending, retry, conflict and unsaved-change states; test permission denials and recovery.
- [x] Complete final diff review, focused commits, and [draft PR #45](https://github.com/dylandrozario/the-gavel/pull/45). Merge PR #44 first, update from main, and rerun affected checks. Local checks passed: 1,465 database assertions, 42 concurrency tests, 597 unit tests, three focused form tests after additional coverage, three browser cases (one mobile write skipped), TypeScript, lint, formatting, schema lint, and production build. Clean-install migration CI and human review remain pending.

**Acceptance:** Only eligible active administrators may view or edit the four allowlisted fields. Invalid input never reaches storage; changed writes are atomic and auditable. No value is fabricated and no public route is added.
