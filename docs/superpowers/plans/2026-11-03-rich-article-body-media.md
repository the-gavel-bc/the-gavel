# Rich Article Body Media Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement one task at a time. Track steps with checkboxes. Do not start product code until this plan is accepted and Task 3's media boundary is integrated.

**Goal:** Let authorized editors place finalized private images with alt text and captions in draft bodies, without changing existing bodies or exposing arbitrary embeds.

**Architecture:** Extend the canonical document grammar additively with a version 2 image block. Keep version 1 documents valid and unchanged. On each versioned draft save, the database validates every image ID against a finalized asset for the same article, then replaces relational body-asset references in the same transaction as content, revision, and audit writes. The editor uses fixed controls and an authenticated private image route; pasted HTML and arbitrary image URLs remain blocked. Video stays unavailable until the owner names approved providers.

**Tech Stack:** Existing Next.js, React, TypeScript, Tiptap, Supabase PostgreSQL/Storage, pgTAP, Vitest, and Playwright. No new dependency is assumed.

**Spec:** [Accepted Phase 4 editorial contract](../specs/2026-11-01-editorial-workflow-design.md), [Phase 4 task order](2026-10-29-phase-four-editorial-controls.md), and [Task 3 media boundary](2026-11-02-private-article-media.md).

## Decisions and boundaries

- The first image-capable envelope uses `format: "gavel-draft", version: 2`; version 1 bodies and revision snapshots remain byte-for-byte untouched. Saving an old document without inserting an image may keep version 1. The editor never silently removes unknown nodes or attributes.
- An image is a block node with a finalized `assetId`, required nonblank alt text of at most 240 characters, and optional plain-text caption of at most 500 characters. Its source URL, Storage key, dimensions, and uploader are never accepted from the body. TypeScript and SQL enforce identical bounds.
- A body image may use an asset reserved for the same article. Asset ownership is article-scoped; a credited non-owner gets no authority. The existing checked draft save operation retains its request/version behavior and transaction boundary.
- The relational reference set is authoritative for retention. Replace it only after the whole new body validates. Removal and save lock consistently so cleanup cannot delete an asset being attached; failed saves preserve old references and history. The existing revision reference table has one asset per revision; expand its key for multiple image IDs and preserve existing main-image rows before body images are recorded.
- Add `GET /api/articles/[id]/media/[assetId]` to the existing upload route. Check article read authority and finalized status through the user-scoped client, then stream only the trusted private WebP with private, no-store and nosniff headers. No anonymous image URL, raw iframe, SVG, HTML, data URL, or external image URL enters content.
- Video controls remain visibly unavailable. Exact provider names and allowed URL shapes are a pending owner decision; video grammar, rendering, and storage are a later focused slice after that decision. Public article rendering remains Phase 5.
- Keep this task small: grammar/database integrity first, editor integration second. Each receives its own reviewable commit. Use one task document; update authoritative API/data/security text only where behavior changes.

## Review focus

1. Old version 1 bodies, current revisions, and unknown future content are preserved; unsupported content stays read-only with no lossy save.
2. Forged, pending, deleting, missing, other-article, and repeated asset IDs cannot create trusted body references or expose objects.
3. A save racing media removal cannot attach a deleted object; an aborted save leaves content, refs, receipts, revisions, and audit unchanged.
4. Stale versions and exact retries retain the existing save semantics, including recovery after a conflict; no duplicate history.
5. Keyboard/mobile image insertion, alt/caption errors, loading/error preview states, and paste/drop rejection are usable without opening unsafe content.

---

### Task A: Versioned grammar and transactional references

**Files:** `src/lib/articles/draft-contract/`, `supabase/migrations/20261103*` (new forward migrations only), `supabase/tests/017_*`, generated database types, focused contract parity tests.

**Interfaces:** `DraftDocument` accepts the existing version 1 grammar and a version 2 image block `{type:"image",attrs:{assetId:string,alt:string,caption:string|null}}`. `private.is_valid_draft_document(jsonb)` mirrors TypeScript shape and byte/node/depth limits. `public.save_article_draft(uuid,integer,uuid,jsonb)` keeps its existing call signature and result; successful saves atomically reconcile `article_body_images(article_id,asset_id)` with the new body's unique image IDs. The existing `private.article_revision_media_refs` key supports multiple assets per revision after migration.

- [x] Write failing TypeScript/SQL parity tests for version 1 preservation; valid image nodes; malformed attrs, hostile URLs/HTML, empty/oversized alt/caption, duplicate IDs, and the existing document limits.
- [x] Cover owner/admin success and credited non-owner, inactive, anonymous, pending, deleting, missing, and other-article denials. Cover stale version, retry, rollback, and save/removal races with pgTAP and focused concurrency tests.
- [x] Add the additive validator, relational reference table, narrow grants/RLS, and save-time authority and asset checks. Lock media rows before reconciliation; capture the new reference state in the same revision transaction. Do not rewrite old rows or applied migrations.
- [x] Run focused parity/pgTAP, full database suite, schema lint, and generated-type drift once the SQL slice is complete. Commit the grammar and database boundary in reviewable increments.

### Task B: Editor controls and private preview

**Files:** `src/lib/articles/draft-document/`, `src/components/dashboard/draft-editor/`, `src/components/dashboard/draft-toolbar/`, `src/components/dashboard/draft-form/`, focused component/browser tests; reuse `src/lib/media/` and `src/app/api/articles/[id]/media/[assetId]/route.ts` where their checked contracts suffice.

**Interfaces:** The editor adapter round-trips version 1 and 2 without losing unknown content. Image insertion accepts only a finalized asset ID for the article, alt text, and caption. The upload picker reuses Task 3's reservation and POST route. `GET /api/articles/[id]/media/[assetId]` supplies the checked private preview; the body stores no URL.

- [x] Cover insert/edit/remove, version 1 round trips, unknown-content read-only behavior, failed private previews, duplicate images, and blocked HTML/file paste or drops with focused tests.
- [x] Add a fixed Tiptap image node and keyboard-accessible image/caption controls. Reuse Task 3's upload protocol and retry behavior; add the checked private GET route with denied-read tests. Include explicit alt validation, safe image loading/error text, and a no-JavaScript read-only fallback.
- [x] Preserve the existing editor version-conflict reload/reapply path. Keep video unavailable with a clear pending-provider label.
- [x] Run focused unit/component checks, desktop/mobile browser cases for insert, save/reopen, keyboard, denied preview, and no-JavaScript reading, plus typecheck, lint, format, and build. Commit adapter and UI separately.

### Task C: Integration and review

- [x] Update affected API, data, security, and component documentation with implemented behavior and the unresolved video decision. No separate verification report or screenshots were added.
- [x] Complete one final code review for asset retention, authorization, old-document preservation, accessibility, and unsafe content; address the no-JavaScript finding.
- [ ] Obtain the required second maintainer review for rich content and migrations.
- [x] Open focused [PR #31](https://github.com/dylandrozario/the-gavel/pull/31) from the Task 4 implementation branch after Task 3 merged. Report checks actually run; the owner will monitor hosted CI.

**Acceptance:** An authorized owner/admin can save and reopen body images with required alt text and bounded captions. Invalid or foreign media and unsupported content cannot be saved or displayed as trusted media. Existing version 1 documents and snapshots remain intact. Video remains unavailable pending provider approval.
