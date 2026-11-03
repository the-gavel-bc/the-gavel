# Private Article Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let an authorized editor upload a validated private raster image and attach it as a draft's main image without exposing untrusted files or weakening draft history.

**Architecture:** A checked request RPC reserves an opaque asset ID for one article. A same-origin server route receives at most 10 MiB, decodes JPEG/PNG/WebP, bounds dimensions and pixels, re-encodes to WebP, places only validated bytes in a private Storage bucket, and asks a service-role-only finalize RPC to mark the asset usable after user-scoped checks. A narrow versioned main-image RPC links the asset, alt text, and credit and captures article history. A checked remove flow marks an unreferenced asset unavailable before object cleanup.

**Tech Stack:** Supabase PostgreSQL, RLS, private Storage, Next.js route handlers/server actions, Sharp, TypeScript, Vitest, pgTAP, Playwright.

**Spec:** [Accepted Phase 4 editorial contract](../specs/2026-11-01-editorial-workflow-design.md).

## Global Constraints

- This task covers one draft main image. Rich body image nodes, profile pictures, public rendering, and publishing are later tasks.
- JPEG, PNG, and WebP input only; maximum 10 MiB compressed input, 6,000 pixels on either axis, and 24 million decoded pixels. Reject animations/multiple pages, SVG, HTML, unsupported codecs, and mismatched declared MIME. Strip source metadata in the re-encode.
- The bucket stays private. No user-supplied filename becomes a Storage path. Direct application writes to trusted media records and objects remain denied.
- Authors manage assets only on their own drafts; an eligible active administrator may manage any draft. Credits do not grant ownership. Existing articles, revisions, and object paths are not rewritten.
- Owner decision (2026-11-02): the Next.js server may use a Supabase service-role key solely for validated private Storage writes and cleanup. Keep it out of browser bundles, logs, and client responses; each request still passes user-scoped authorization and database checks.
- Ruling: use a narrow main-image mutation rather than extending the Phase 3 draft payload; this preserves exact old request fingerprints and receipt replay across a mixed-version rollout. It costs one versioned RPC and a form coordination step.

## Review Focus

Before PR: cleanup must not race an upload in progress; failed cleanup must retain its asset ID and a retry path; a version conflict must offer recovery without repeating a stale request. Cover an allowed-format animated image with decoder tests.

1. A valid header with corrupt body must fail decoding before trusted upload; processor test.
2. Oversized dimensions, excessive total pixels, animation, and a MIME mismatch must fail before trusted upload; processor tests.
3. A credited non-owner, inactive member, anonymous caller, and ordinary author targeting another article cannot reserve, finalize, attach, read, or remove an asset; SQL and route tests.
4. A direct RPC cannot mark a nonexistent or wrong-article object finalized; SQL tests.
5. A removal racing with attachment cannot delete a referenced object; SQL lock/retention tests.

---

### Task A: Private schema, reservation, and Storage boundary

**Files:** New forward migration under `supabase/migrations/20261102*`; `supabase/tests/016_media_*.test.sql`; generated database types.

**Interfaces:** `public.request_article_image_upload(p_article_id uuid,p_request_id uuid) -> jsonb` returns a stable opaque asset ID for an authorized draft. `public.finalize_article_image_upload(p_actor_user_id uuid,p_asset_id uuid,p_sha256 text,p_byte_size integer,p_width integer,p_height integer) -> jsonb` is callable only with the server's service role after validation and checks the claimed actor, article and trusted object before changing pending to finalized. `public.media_assets` stores article/uploader/opaque key, state, validated output metadata, and request identity. Only a private trusted bucket is created.

- [x] Write pgTAP RED for owner/admin reservation, exact retry, other-owner and inactive/anonymous denial, direct table/Storage mutation denial, and finalization without a trusted object.
- [x] Implement additive schema, narrow grants/RLS, checked request/finalize RPCs, and private bucket policy. Keep existing stored data unchanged.
- [x] Run focused pgTAP GREEN, full database suite, schema lint and generated-type drift. Commit the independently reviewable schema boundary.

### Task B: Bounded server intake and safe cleanup

**Files:** `src/lib/media/image-intake/`, `src/lib/media/media-actions/`, `src/app/api/articles/[id]/media/[assetId]/route.ts`, env/server helpers and tests, `.env.example`, deployment/security docs.

**Interfaces:** `processArticleImage(bytes: Uint8Array, declaredType: string) -> Promise<{bytes: Uint8Array; contentType: 'image/webp'; width: number; height: number; sha256: string}>`. The route accepts a reserved asset and a multipart `file`, then writes only processed bytes. A remove operation first marks an unreferenced asset unavailable, deletes its object, then clears its record; retries are safe.

- [x] Write processor/route RED for valid synthetic inputs, corrupt and mismatched bytes, unsupported formats, all size/dimension bounds, missing/foreign assets, and failure cleanup.
- [x] Add Sharp explicitly, implement bounded intake, server-side authorization, private Storage promotion, finalize and retry-safe removal using the approved credential model.
- [x] Run focused tests, types, lint and build. Commit server media behavior and env/deployment notes.

### Task C: Versioned draft main-image attachment

**Files:** Forward migration, `src/lib/media/media-actions/`, draft detail query adapter, `src/components/dashboard/article-media/`, draft form/detail and focused tests.

**Interfaces:** `public.set_article_main_image(p_article_id uuid,p_expected_version integer,p_request_id uuid,p_asset_id uuid,p_alt_text text,p_credit text) -> jsonb` creates/replaces a relational main-image link only for a finalized asset belonging to that article; a null asset removes the link. Snapshot/history includes the link. Exact retry uses a separate private receipt record and does not change the Phase 3 draft request hash.

- [x] Write SQL/contract RED for missing, pending, foreign, removed, and retained asset references; no-op and stale-version saves; alt/credit bounds; owner/admin and credited non-owner paths.
- [x] Add the relational reference and strict application/database validation; extend snapshot capture without changing existing draft RPC payloads, rows, or revisions.
- [x] Add an accessible upload/attach/remove control with status, progress, retry and field errors, integrated into the existing draft form. Validate keyboard and mobile behavior.
- [x] Run focused SQL, contract, component and browser GREEN; commit database attachment then UI as separate reviewable changes.

### Task D: Integrated verification and review

- [x] Run documented database, generated-type, unit, contract, concurrency, browser, type, lint, format, production build and dependency-audit gates on Node 22.
- [x] Verify an incremental local upgrade preserves existing rows; inspect private Storage visibility and cleanup/retention races. Capture desktop/mobile screenshots and review the security-sensitive diff.
- [ ] Push this task branch, open a focused PR stacked on Task 2 while its PR is open, and record exact-head hosted CI. Retarget in order after earlier task PRs merge.
