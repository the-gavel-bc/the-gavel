# Editorial Article Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal.** Editors and administrators can open a reader-style preview from the draft save bar and return to the same editor.

**Architecture.** Serve the current saved draft from a separate authenticated page under `/dashboard/articles/[id]/preview`. Share the public article layout and rendering components. Use the signed-in user's existing database and private image access.

**Tech stack.** Next.js App Router, React, Supabase RLS, Vitest, Playwright.

**Status.** Implemented on `feat/editorial-article-preview`, based on `main` at `0646640`. Preview starts from the most recent confirmed save.

## Workflow

1. On a saved draft the caller may edit, show **Preview article** as a secondary action in the sticky save bar. Editors can preview their own editable drafts and other authors' drafts in review. Administrators can preview any editable draft. Authors do not get this action, even on their own drafts.
2. The preview opens in the same tab. A small **Draft preview** bar contains **Back to editor**, a native link to the same article's dashboard editor. Browser Back also works.
3. Show the saved title, section, excerpt, ordered byline and credits, publication date, main image, rich body and captions, and topic labels. Draft topic labels are plain text. Reuse the reader's typography, widths, breakpoints, and date formatter. When the publication date is unset, show the date the article would use if published today in Eastern time and label it as an estimate in the preview bar. Render missing optional fields as the public layout would. Give missing body content or unavailable images a clear preview-only status without blocking the page or exposing internal storage details.
4. Show Preview after the first confirmed save. Disable it while the editor has unsaved changes, an unconfirmed save, or pending media edits. Use the save bar's existing state and a short instruction to save or finish media changes. Preview does not submit, publish, or silently save. A URL visit or refresh reads the latest authorized saved snapshot. Returning to the editor reloads its current authorized state.

## Reference implementation

The demo pairs `publish.js` with the same browser-rendered `article.js` used by its reader. The desk links titles to the article URL, and the article renderer adds a draft flag after its signed-in Supabase lookup. The production article handler handles unpublished slugs separately from its public metadata response. Reuse the idea of a shared article renderer and a visible draft flag. Give The Gavel its own server-authorized dashboard preview URL so the public route and its metadata retain their published-only behavior.

## Reviewer acceptance checks

| Review lens | Evidence to include in the PR |
| --- | --- |
| [Security](../../../.claude/agents/security-reviewer.md) | Trace the save-bar link, direct page request, embedded database read, and each private media request through the existing session and article policies. Prove that the preview cannot be used to read another article or its media. Check HTML and RSC for private, no-store responses, generic metadata and errors, and the existing CSP. Cover signed-out, inactive, author, unrelated editor, and revoked or returned-draft cases. Confirm draft content stays in authorized responses and out of public metadata, search, sitemap, URLs, and logs. Render only validated canonical content through the existing safe React renderer. |
| [Performance](../../../.claude/agents/performance-reviewer.md) | After the request-scoped access lookup, use one bounded article snapshot query plus at most one batched public-profile lookup. Capture the query count with zero and multiple contributors and images. Media bytes load separately through the existing scoped endpoint. Avoid per-credit or per-image metadata queries, editor catalogs, and related-story reads. Keep the renderer server-side, load the hero eagerly and body images lazily, and check the production route bundle for editor dependencies. Private content stays outside shared caches. |
| [Architecture](../../../.claude/agents/architecture-reviewer.md) and [code quality](../../../.claude/agents/code-quality-reviewer.md) | Keep the route responsible for composition, the server-only backend responsible for authorization and data parsing, and shared reader components responsible for rendering typed presentation props. Reuse the existing article capability, rich-body validator, date formatting, and media delivery. Keep public and private URL construction in separate adapters. Use a narrow preview result and shared rendering props without unchecked casts or a second renderer. The planned implementation uses existing RLS policies, grants, and schema. |
| [Business logic](../../../.claude/agents/business-logic-reviewer.md) | Use the last confirmed saved snapshot, the existing edit permission and draft lifecycle rules, and Eastern publication dates. Test save pending, a concurrent save, a draft returned to its author, and a draft published while the preview is open. A fresh preview after any of these events must apply the current role and state. Assert that preview leaves the saved version, revision count, and lifecycle state intact. |
| [UI and accessibility](../../../.claude/agents/ui-ux-reviewer.md) | Compare the public and preview article rendering at phone and desktop widths. Check save-bar wrapping, keyboard activation, visible focus, ordinary browser Back, the native Back to editor link, and the explanation for a disabled action. Verify missing content and failed images keep the draft readable and the return link available. |
| [Testing](../../../.claude/agents/testing-reviewer.md) and [operations](../../../.claude/agents/devops-reviewer.md) | Use unit tests for parsing, fetch counts, and component state. Use the local Supabase and browser suite to exercise actual RLS and authenticated media, including a different article's asset ID. Run the production build and verify real HTML, RSC, and media headers. Use isolated fixtures and explicit state transitions. Record command results, affected documentation, and any hosted checks still pending. No extra packages, environment variables, or services are planned. |

Request one independent [implementation review](../../../.claude/agents/implementation-reviewer.md) of the finished diff before opening the PR. Give the reviewer the approved plan, base and head commits, and verification results. Fix confirmed security and correctness findings and rerun their affected checks.

## Implementation

### Task 1 · Add the private preview read

**Files.** Introduce `src/backend/articles/article-preview/article-preview.ts` and a sibling test. Check existing patterns in `src/backend/articles/draft-queries/draft-queries.ts`, `src/backend/infrastructure/supabase/server/server.ts`, and `src/app/api/articles/[id]/media/[assetId]/route.ts`.

- [x] Exercise signed-out and inactive callers, active authors, unrelated editors, in-review editors, administrators, missing drafts, and drafts after publication. Verify own-draft and archived authority through the existing database policy suites.
- [x] Add `getEditorialArticlePreview(articleId)` with `ok`, `notFound`, and `unavailable` outcomes. Validate the UUID and check active editor or administrator access before reading. Use the cookie-scoped Supabase client, existing article RLS, and the same edit capability and draft-state checks as the edit page. Return only checked data needed to render the article.
- [x] Read the saved text, associations, and article-scoped media descriptors in one embedded snapshot. Validate the canonical body through the existing shared validator. Resolve author links and biographies only from the public profile projection, in a single batched lookup if needed. If that lookup fails, keep the checked byline as text and omit links and biographies. Reject cross-article image descriptors. Verify that the preview never exposes a private biography or storage key.
- [x] Run the focused Vitest checks. Test a concurrent save and a review withdrawal while opening preview. Each successful read must contain one version's text and associations, and a fresh request must obey the caller's current permissions.

### Task 2 · Share the article presentation and add navigation

**Files.** Add `src/app/(editor-preview)/dashboard/articles/[id]/preview/page.tsx`. Extract the reader article frame from `src/app/(public)/articles/[slug]/page.tsx` and its CSS into the existing reader component tree. Modify `src/app/(dashboard)/dashboard/articles/[id]/page.tsx` and `src/frontend/features/articles/components/draft-form/draft-form.tsx`.

- [x] Add component and route tests for the save-bar action, disabled states, back link, noindex metadata, missing content, and preview image URLs. Verify that the public article page still renders its existing URLs and metadata.
- [x] Render the same article frame at reader width. Keep the draft flag and editor link outside the article. Pass the image URL builder into the shared rendering adapters so published pages use public media and previews use the existing protected private media endpoint. Preserve public article related-story behavior. Keep the preview focused on the draft and its own context.
- [x] Check access on every preview request, including direct URLs. Use dynamic rendering, `private, no-store`, and noindex metadata with a generic title. Reuse the dashboard's session handling, disable link prefetch, and verify these headers on both HTML and RSC requests. Use the same generic 404 for missing, unreadable, and ineligible drafts. Keep the existing sign-in flow for signed-out requests and use a fixed, local editor URL for the return link.
- [x] Build the app to verify that both route groups coexist. Exercise the save bar in the desktop and mobile projects.

### Task 3 · Exercise the review workflow

**Files.** Add `e2e/drafts/article-preview.spec.ts` and update the relevant sections of `docs/component-hierarchy.md`, `docs/api-contracts.md`, and `docs/security-and-permissions.md` when the feature is implemented.

- [x] On desktop and mobile, sign in as an editor, open a submitted draft, preview the saved story, and return to the same editor. Check real main and body images, credit, caption, date, and keyboard activation. Exercise the same workflow as an administrator on an unsubmitted draft.
- [x] Verify that unsaved edits stay in the editor, save enables preview, and preview writes no draft, revision, or publication. Attempt direct preview as the article's author and an unrelated editor. Exercise a revoked session, a publication or return-to-author transition, and verify the public article URL still returns 404 for the draft.
- [x] Run `pnpm typecheck`, `pnpm lint`, the focused Vitest suites, the current article authority and media database tests, and `pnpm exec playwright test e2e/drafts/article-preview.spec.ts` against the disposable local Supabase project. Inspect the production build route list and verify private response headers before opening the PR.

## Verification notes

- Focused Vitest run passed 138 tests. The local database passed 143 assertions across six article and media policy suites. All six preview browser cases passed against a production build, three each on desktop and mobile.
- The browser exercised real image uploads, HTML and RSC privacy headers, an independent save followed by a fresh preview, and access loss after review withdrawal, revocation, or publication. A manifest check found three preview client chunks and no editor dependency markers.
- Independent review caught a missing role handoff when the first photo creates a draft and public topic links for draft-only labels. Both have regression coverage. The browser checks exercised keyboard activation and mobile navigation. They did not include a pixel-by-pixel layout comparison.
