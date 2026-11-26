# Performance batch: dashboard and reader responsiveness

Status: planned 2026-11-26. Slice 1 built 2026-11-26; slice 2 measured and not needed; slice 3 not started.

Source: two read-only reviews on 2026-11-26, one of the staff dashboard and one of the public reader. Their main claims were checked against the code. Items that were rejected, deferred or dropped (data caching for reader pages, full-page CDN caching, stale-while-revalidate on images, `getClaims`, the RLS rework, parallel related stories, sitemap caching) are recorded in [DEFERRED.md](../../code-reviews/DEFERRED.md#performance-review-decisions-2026-11-26).

## Owner decisions (2026-11-26)

- **Approved:**
  - #9, images sized for the screen;
  - the safe batch: client reuse of recent dashboard pages, the parallel edit-page read, lazy-loading the image library, the smaller logo and the typeahead index.
- **Rejected:** #10, serving stale images while refreshing. The five-minute image takedown bound in [security-and-permissions.md](../../security-and-permissions.md#public-media-delivery-route) stays.
- **Deferred:** #8, reader data caching. Full-page CDN caching is noted as the next step if reader speed is still not good enough.

## Context

- **Deployment:** Vercel Hobby, functions in `pdx1`; Supabase in `us-west-2`, the same region.
- **Database cost:** a dashboard click costs about 4–5 database round trips of 1–3 ms each.
- **Likely causes of 1–2 s clicks:** cold starts, every click being re-rendered on the server (no client reuse), and the browser round trip.
- **Reader images:** photos on the public site are single-size WebP files up to 2400 px, so phones download full-size files for small cards.

## Slices

Each slice is one small pull request, reviewed before the next one starts.

### Slice 1: dashboard quick wins (no database change)

**1a. Reuse recently visited pages for 30 seconds.** Add `experimental: { staleTimes: { dynamic: 30 } }` to `next.config.ts`.
- **Why:** Next 16 keeps no client copy of dynamic pages, so Back and repeat clicks re-render on the server.
- **Behavior:**
  - A page revisited by client navigation within 30 s appears instantly. The setting applies to the public site too.
  - Changes made by other people can take up to 30 s to appear.
  - The server still checks access on every real request and every action.
- **Risks to solve before coding:**
  - **Stale draft after your own save.** A server action that calls `revalidatePath` clears the client cache. Audit every mutating action and add `revalidatePath` to any that changes what a page shows but lacks it. Covers draft, lifecycle, correction, media attach, membership, taxonomy, homepage, site information and profile actions.
  - **Sign-out.** `signOut` must clear the client cache (`revalidatePath("/", "layout")`), so Back cannot show a cached dashboard page after signing out.
  - **Conflict recovery.** A stale cached editor page can only be older than the server copy. The existing version check still turns a save into a conflict with the recovery panel; no data is lost.
- **Acceptance:**
  - After saving, publishing or returning an article, going to the list and back shows the new state immediately.
  - After signing out, Back does not show dashboard content.
  - A change by another user appears within 30 s.
- **Docs:** [architecture.md](../../architecture.md), rendering and caching section.

**1b. Edit page: load the main image in parallel.** In `src/app/(dashboard)/dashboard/articles/[id]/page.tsx`, start `getArticleMainImage(id)` together with `getDraftEditorData(id)` and discard it if the article is not found or is forbidden.
- Both reads use the user's RLS-scoped client, so a forbidden article still returns nothing.
- **Acceptance:** identical page output. The existing role-denial tests for the edit page still pass.

**1c. Load the image library only when processing.** `src/backend/site-information/about-image/about-image.ts` imports `sharp` at the top, and `/about` and the Site information page import that file just to read a URL.
- **Change:** move the `sharp` import inside the processing function (`await import("sharp")`).
- **Acceptance:** after `next build`, the trace file for `/about` no longer lists `sharp`; About image upload still works (existing tests).

**1d. Smaller logo.** Re-encode `src/frontend/assets/brand/gavel-logo.png` (75 KB) as a palette PNG with sharp, keeping its size in pixels.
- **Acceptance:** under about 25 KB, with no visible difference when compared side by side at 1x and 2x.
- **Docs:** [design-system.md](../../design-system.md) brand entry, if the file name changes.

**Verification for slice 1:** typecheck, lint, format check, unit tests; Playwright `e2e/roles`, `e2e/drafts` and `e2e/access-boundary`, plus new e2e steps for the 1a acceptance criteria (save, leave, return; sign out, Back).

### Slice 2: typeahead index (one migration)

`suggest_public_articles` scans published titles with `lower(title) like '%text%'` (ponytail note in `20261113010000_public_search_suggestions.sql`).

- **Migration:**
  - `create extension if not exists pg_trgm with schema extensions;`
  - a partial GIN index `on public.articles using gin (lower(title) extensions.gin_trgm_ops) where status = 'published'`.

  The function's predicate already matches it, so the function itself doesn't change.
- **Check before merging:**
  - `EXPLAIN (ANALYZE)` of the suggestion query on about 5,000 seeded articles, before and after. The C-25 rule is to measure first.
  - Confirm `pg_trgm` is available on the hosted project.
  - Confirm the catalog-invariant test (`071`) allows the extension schema.
- **Acceptance:**
  - Suggestions return the same results (existing pgTAP and e2e).
  - The index exists (new pgTAP assertion).
  - A selective query uses the index on the seeded catalog.
- **Deploy:** `pnpm exec supabase db push`.
- **Docs:**
  - [data-model.md](../../data-model.md): the index;
  - [api-contracts.md](../../api-contracts.md): the suggestion contract is unchanged;
  - remove the ponytail note in a follow-up migration comment, not by editing the old migration.

### Slice 2 results (2026-11-26): measured, index not built

The 5,000 seeded published articles were added inside a transaction and rolled back afterwards. `EXPLAIN (ANALYZE)` of the suggestion query:

| Query | Without index | With the trigram index |
| --- | --- | --- |
| Selective (`%4f3a%`, 1 match) | 5.2 ms, backward scan of `articles_recent_published_idx` | 6.2 ms; the planner kept the same scan and ignored the index |
| Common (`%campus%`, 5,000 matches) | 4.7 ms, sequential scan plus top-6 sort | 6.8 ms, bitmap scan on the new index |

- **Result:** at 5,000 articles, more than a century of output at a few hundred stories a year, the query takes about 5 ms. That is far from its 2 s statement timeout, and the index made it no faster.
- **Write cost:** a GIN index would also add work to every article save.
- **Decision:** the index is not built. Scans grow linearly, so recheck when the catalog passes about 50,000 published articles.
- **50,000-row run:** attempted on the local Docker database, but the backend was killed for memory during the seed insert. The transaction rolled back and no data changed.
- **Follow-up (owner request, 2026-11-26):** suggestions now match keywords instead of substrings. Every typed word must start a title word, and at least 3 characters are required (`20261126010000_keyword_search_suggestions.sql`).
  - The existing full-text index stores whole words only, so it cannot match word starts. Matching therefore stays on titles.
  - Timing at 5,000 seeded articles: a word that matches nothing scans every title in about 31 ms; common words stop after 6 matches in under 1 ms.
  - The client still waits for a 300 ms pause and aborts stale lookups, and answers are cached for 30 s.

### Slice 3: images sized for the screen (#9)

**Decision to record:** ADR 0016, "Resize public images on request". On-demand resizing is chosen over storing variants at upload:
- **Stored variants would:** add Storage objects, finalization steps, hashes and cleanup paths, and widen the Storage authorization policy, which only allows known finalized keys.
- **Resizing on read reuses:** the existing authorized, hash-checked download of the original.

C-22 in DEFERRED.md suggested variants stored at upload. The ADR supersedes that suggestion.

**Route** (`src/app/api/public/articles/[articleId]/media/[assetId]/route.ts`):
- **The `w` parameter:**
  - Accept an optional `w` of `480`, `960` or `1600`. Any other value returns the existing generic 404 with no-store.
  - With no `w`, the route behaves exactly as today.
- **Authorization:** the same projection, Storage download and size, hash and WebP checks run on the original first, so authorization, archive races and integrity are unchanged.
- **Resizing:** sharp, imported lazily, with `resize({ width: w, withoutEnlargement: true })` to WebP quality 80. An original narrower than `w` is returned as is.
- **Headers:** the same `public, max-age=300, s-maxage=300, must-revalidate, proxy-revalidate` and nosniff. The five-minute takedown bound holds for every variant.
- **HEAD** runs the same checks.
- **Private previews** and the dashboard keep full-size images.

**Components** (`story-image.tsx`, `reader-image.tsx`, `article-body.tsx`, `article-header.tsx`, `article-context.tsx`):
- Emit `srcSet` with only the widths smaller than the stored width, plus the original, and a `sizes` value for each placement.
- Placements: homepage lead, Latest column, Featured row, section cards, archive lead and cards, article header, body images, related stories.
- Take each `sizes` value from the real CSS widths, measured in the browser at 375, 768 and 1280 px.
- Keep `width`, `height`, `loading` and `fetchPriority` as they are.
- No inline styles, so the nonce CSP stays clean.

**Risks:**
- **CPU and memory on a cache miss:** decoding a 2400 px WebP takes about 20 MB of memory. Each width is cached for five minutes per region, which bounds the extra work at this traffic. Measure the function duration of a miss.
- **Cache-key bypass:** only three `w` values exist; other values are 404 and not resized.
- **Archive race:** unchanged, because the Storage authorization recheck runs before resizing.

**Acceptance:**
- At a 375 px viewport, homepage card images load a 480 or 960 variant: `currentSrc` contains `w=`, and the transferred size is well below the original.
- Desktop article images load an appropriate width.
- An archived article's variant URL returns 404, like its original.
- `w=123` returns 404.
- No CLS regression: `width` and `height` are still set.

**Verification:**
- Route unit tests: valid, invalid and narrower-than-`w` cases, and HEAD.
- `srcSet` builder unit tests.
- Playwright: a mobile viewport on home, archive and article pages, plus the archive-404 check.
- Typecheck, lint, format, build.

**Docs:**
- [api-contracts.md](../../api-contracts.md): public media route and `w`;
- [security-and-permissions.md](../../security-and-permissions.md#public-media-delivery-route): variants are derived from the verified original and keep the same cache bound;
- [design-system.md](../../design-system.md): images section;
- ADR 0016 and the [decisions index](../../decisions/README.md);
- the C-22 row in DEFERRED.md.

### Slice 1 results (2026-11-26)

- **1a:**
  - The action audit found every page-changing server action already calls `revalidatePath`. Only `signOut` lacked it; added.
  - New role journey: an author saves, leaves, returns by client navigation and sees the saved excerpt; after sign-out, Back stays on sign-in.
  - The role fixture now reads the stored slug, because any draft save re-derives it from the title.
  - The 30-second lag for other people's changes is accepted and not browser-tested, since it would need a 30-second wait.
- **1b:** done. The image read is settled up front, so a failure is reported only when the image is used.
- **1c:**
  - A dynamic `import("sharp")` is still traced into the bundle. Processing moved to `about-image-processing.ts` instead.
  - `/about` now traces no sharp files (it traced 104 before).
  - The Site information page still bundles sharp because it hosts the upload action. That is accepted, since the page is administrator-only.
- **1d:** the logo went from 75,737 to 31,703 bytes (palette PNG at the same 1536 × 288). Composited on white, the mean difference is 0.06 out of 255, and 2 pixels out of 1.3 million differ by more than 24.
- **Checks:**
  - Vitest: 198 files and 1,394 tests passing, plus typecheck, lint and format.
  - Playwright: `e2e/roles`, `e2e/access-boundary` and `draft-conflict-recovery`, 32 passing.
  - The full `e2e/drafts` run: 138 passed. The failures were only in the admin site information, taxonomy and homepage specs, which fail on the long-lived local database's leftover data, as before.

## Order and rollout

1. Slice 1, then slice 2, then slice 3. Each gets its own branch and pull request, and is reviewed once before its PR.
2. Slices 1 and 3 need no database step. Slice 2 needs `supabase db push` after merging.
3. After each deploy, time a dashboard click warm and cold, and run a phone-size Lighthouse check of the homepage. Note the numbers in this plan.

## Not in this batch

Reader data caching (#8), full-page CDN caching, `getClaims` and the RLS rework. See [DEFERRED.md](../../code-reviews/DEFERRED.md#performance-review-decisions-2026-11-26).
