# Phase 5 Task 7 — reader tokens and card primitives

Status: implemented and verified locally on `feat/reader-card-primitives`, based on PR #55; PR #55 is now merged; this PR targets main independently.

## Design and acceptance

- Adapt the demo's ink/deep-blue/white palette, serif editorial headings, sans-serif metadata, 3:2 thumbnails and responsive grid. Scope every token and selector to reader components; dashboard/global styling remains unchanged.
- The reference logo has no confirmed provenance. Its Google Fonts references identify candidate families but provide no bundled font files/license notices. Use system Georgia and system sans-serif for this slice; import no logo or external font. Branding and exact screenshot reconciliation remain explicit future inputs.
- Add server-renderable ReaderSurface/ArticleGrid, ArticleCard, StoryMeta, pagination and empty/unavailable presentation. Cards consume the checked public card type, use the public image route without Next image optimization, and preserve image dimensions and honest absence states. Real links use canonical article/section/author paths; no fake content enters application routes.
- Move the public card type into shared ownership so frontend never imports backend modules; keep backend runtime validation authoritative and compile-time checked against the shared shape.
- Native links, visible keyboard focus, wrapped long titles, 320px reflow and high-contrast text are required. No animations are introduced, so reduced motion has no extra behavior to disable. Default card headings are h3 with an h2 option for the owning page.
- No homepage/header/footer replacement in this slice. Task 8 wires the shell, later tasks consume cards. Browser proof uses a temporary synthetic fixture that is removed before commit.

## Verification

1. Add focused component tests for real links, credited byline, UTC dates, images/missing images, escaping and pagination states.
2. Implement colocated CSS Modules and shared type ownership. Run focused component/backend tests, types, lint and format.
3. Review once and exercise a temporary fixture in Chromium at narrow and desktop widths with keyboard/reduced-motion checks; do not add a public demo route to the committed app.
4. Update design/component docs and status; commit coherent changes, open a draft PR targeting main, and identify dependency on #55. Human screen-reader review and visual signoff remain outstanding.

## Verification evidence

- Eight focused component/list-reader tests passed; TypeScript and lint passed. Temporary Chromium fixture passed at 320, 768 and 1440px with no horizontal overflow, one/two/four grid columns, decoded media, visible keyboard focus and reduced motion.
- Computed token contrast: ink/white 18.08:1, muted/white 5.96:1, blue/white 8.08:1, muted/soft 5.32:1.
- The reviewer service was interrupted by its usage limit. A subsequent inline review checked type boundaries, scoped styles, native links and credits; the missing credit display was corrected. This is not human accessibility or visual approval.
- The temporary fixture and development server were removed/stopped. No synthetic content or preview route is committed. Exact screenshot reconciliation, branding provenance and human screen-reader review remain pending.

- Production build and format checks passed. The first build found stale generated development types for the removed fixture; clearing only `.next/dev` resolved it. Main synchronization introduced no application-code changes.
