# Published Article Editing Implementation Plan

**Goal:** Let an eligible owner or administrator save changes to a published article while keeping its public identity, publication state, and history intact.

**Basis:** The accepted [Phase 4 contract](../specs/2026-11-01-editorial-workflow-design.md) and [Task 5](2026-10-29-phase-four-editorial-controls.md). PR #31 is merged. This branch starts at `origin/main` after that merge.

## Decisions and scope

- Extend the existing editor and save-state flow, but call a distinct `save_published_article` RPC. The command has the same bounded article fields and version/retry shape as draft save; no client status, owner, slug, publication time, or audit actor.
- A published article keeps its slug, status, and original `published_at` on every content save. Archived articles stay read-only. Existing draft create/save behavior and receipts remain unchanged.
- The database rechecks publication readiness after locking the article and selected references. The reusable readiness predicate requires a supported nonempty body, active section/categories/contributors, and a finalized main image with alt text and credit. It protects both this save and later publish/restore operations.
- Existing private image upload and main-image operations are draft-scoped. Published editing in this task covers title, text, rich body using already attached images, taxonomy, and credits. Adding or replacing images on a published article needs a separate checked media mutation with its own version/history and readiness rules; keep those controls unavailable in published mode until implemented.
- A changed save replaces body-image references, writes one revision and one `article.updated` audit event, and advances the version once. An exact retry returns its original receipt, including after a later save; a no-op creates only the receipt. Stale versions and different payloads using one request ID fail without partial writes.
- Reuse the existing conflict recovery and unsaved-input protection. A status change during editing returns conflict and reload shows read-only state. Unsupported stored content remains read-only.

## Review focus

1. Owner/admin may save; credited non-owner, cross-owner, inactive, and anonymous actors cannot. Direct table writes remain closed.
2. Published slug, status, `published_at`, and owner never change through a content save, even with forged fields.
3. A changed edit cannot leave a published article with empty or unsupported body, inactive references, or missing/unfinalized main image.
4. Media cleanup, attachment, and content save share safe lock order; failure rolls back refs, revision, audit, and receipt.
5. Exact replay, no-op, stale version, and version conflict recovery preserve local input and history.

## Slice A: Database boundary

**Files:** New forward migration; focused pgTAP; generated database types.

- [x] Add failing SQL coverage for role and ownership denials, forged payloads, readiness, slug/timestamp preservation, no-op, retry, stale version, and rollback.
- [x] Add a private publication-readiness predicate and `public.save_published_article(uuid,integer,uuid,jsonb)`. Keep draft RPC and its receipts unchanged.
- [x] Verify focused pgTAP, database lint/types, then commit the boundary.

## Slice B: Server and editor integration

**Files:** Draft command/action/query/reload modules, editor form and media controls, focused unit/component tests, published-edit browser test.

- [x] Add a strict published-save action that routes to the new RPC; retain existing draft command fingerprint and recovery behavior.
- [x] Return published articles as editable, archived as read-only; keep unsupported stored content read-only. Show status-aware labels and disable draft-only media controls in published mode.
- [x] Verify owner/admin save and reopen, stale conflict/reload, archived denial, and desktop/mobile keyboard behavior. Commit focused changes.

## Slice C: Contract and final verification

- [x] Update API/security/testing documentation only for implemented Task 5 behavior. Keep future lifecycle controls clearly proposed.
- [x] Run affected unit, SQL, contract, type, lint, format, build, and browser checks. Review the completed diff once, address findings, and open [Task 5 PR #32](https://github.com/dylandrozario/the-gavel/pull/32).

**Acceptance:** Authorized edits persist with correct version/revision/audit and unchanged slug/status/publication time. Unsafe, unready, unauthorized, stale, archived, and unsupported edits fail safely. Draft journeys continue to work. Human maintainer review and hosted CI remain external checkpoints.
