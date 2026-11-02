# Generated Editorial Slugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Remove author-controlled article slugs while preserving stable published URLs and retry-safe private draft writes.

**Architecture:** Keep the existing draft write RPC signatures and user-scoped client, but remove `slug` from the strict new application payload. Forward migrations derive unique article slugs inside create/save transactions. During mixed-version rollout, the database validates and ignores the old slug field so a previously deployed app can still write; read queries may continue returning the stored slug for display.

**Tech Stack:** PostgreSQL/Supabase, TypeScript, React, Vitest, pgTAP, Playwright; existing dependencies only.

**Spec:** [Accepted Phase 4 editorial contract](../specs/2026-11-01-editorial-workflow-design.md).

## Global Constraints

- Preserve existing stored article and profile slugs; do not edit applied migrations or reset the populated local database before upgrade proof.
- Keep direct article writes denied. New application commands reject `slug`; direct authenticated RPCs may carry a valid old slug field during rollout, but the database ignores its value and derives the stored slug from title. Malformed old slug values still fail.
- Generate from the title using database `unaccent`, lowercase ASCII alphanumerics and collapsed hyphens; use `article` fallback, max 180 characters, then suffix `-2` through `-10000` under a same-base transaction lock.
- Profile slug generation belongs to Tasks 10/12; this task changes article draft writes only.

## Review Focus

1. Two same-title creates must receive distinct slugs without overwriting each other; SQL concurrency test owns this.
2. Retry with the same request ID returns the original receipt even if another article later uses the title; SQL receipt test owns this.
3. A direct RPC payload containing a valid old `slug` cannot choose the stored path; malformed fields fail with no article/history/receipt write. SQL compatibility tests own this.
4. A title change on a draft must update its slug while preserving a published article's existing path; SQL save test owns this.
5. Removing the visible field must preserve keyboard error focus and uncertain-save recovery; component and browser tests own this.

---

### Task A: Database normalization and guarded allocation

**Files:** Create forward migrations `supabase/migrations/20261102000000_generated_article_slug_rules.sql`, `20261102000100_generated_article_draft_writes.sql`, `20261102000200_slug_allocator_lint.sql`, and `20261102000300_legacy_slug_payload_compat.sql`; add `supabase/tests/015_generated_article_slugs.test.sql`; extend `scripts/draft-concurrency/`.

**Interfaces:** `private.article_slug_base(p_title text) -> text`, `private.allocate_article_slug(p_title text,p_article_id uuid default null) -> text`; `private.check_draft_input(jsonb)` rejects `slug`; public draft RPC signatures stay unchanged.

- [x] Write pgTAP tests for normalized Latin accents, punctuation, empty-ASCII fallback, 180-character bound, collision suffix, ignored valid old slug, malformed-slug rejection, draft title change, unchanged published slug, and unchanged history/receipt on denial.
- [x] Run focused SQL test RED against the existing database.
- [x] Implement database normalization and transaction-serialized allocation; replace the private validator and public create/save functions in forward migrations only. Keep exact old receipts replayable. On an already running hosted app, pause draft writes across the intermediate migration states until `20261102000300` is applied and smoke-checked. A rollback to the old app then remains writable because its supplied slug is ignored. Defer strict database rejection until old instances and retries have drained.
- [x] Run focused SQL test GREEN, then full database tests and incremental upgrade preservation. Add an independent-session same-title race check.
- [x] Commit database behavior and tests as reviewable commits, including any necessary legacy fixture updates.

### Task B: Strict client command and form

**Files:** Modify `src/lib/articles/draft-contract/`, `draft-action-contract/`, `draft-queries/`, `src/components/dashboard/draft-form/`, `draft-metadata-fields/`, `draft-conflict-panel/`, and focused tests/fixtures. Update `src/app/(dashboard)/dashboard/articles/new/page.tsx`.

**Interfaces:** `DraftInput` and `CreateDraftCommand`/`SaveDraftCommand` omit `slug`; `checkDraftInput(unknown)` rejects it. Article summaries retain their stored read-only slug.

- [x] Write failing contract tests for a submitted slug and form tests proving no editable slug control or slug error prompt.
- [x] Run focused Vitest RED.
- [x] Remove `slug` from draft input, form state and command parsing; retain read-only summary fields. Update canonical fixtures and parity tests.
- [x] Run focused Vitest GREEN, contract parity, typecheck, lint and accessible desktop/mobile browser checks.
- [x] Commit the command/form change; the accompanying documentation distinguishes implementation from remaining profile-slug work.

### Task C: Integrated proof and review

**Files:** Update this plan and affected docs only for observed evidence or fixes.

- [x] Run full documented database, type, lint, format, unit, build, and browser gates with the required Node 22 runtime. Results are recorded in [testing](../../testing.md#phase-4-task-2-generated-article-draft-slugs).
- [x] Review the final diff for role/owner denials, idempotency, migration preservation, direct-call bypasses and accessibility. Document the required write pause across intermediate migrations and the allocator lock tradeoff.
- [ ] Push the focused branch, open its PR against `feat/phase-four-editorial-workflow`, and verify hosted CI on the final head.
