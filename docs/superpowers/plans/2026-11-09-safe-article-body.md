# Phase 5 Task 11 — safe canonical article-body rendering

Status: implemented and verified locally on `feat/safe-article-body`, based on Task 10 PR #59. Target main; preceding reader PRs remain prerequisites.

## Acceptance and risks

- Extract semantic rendering from the existing private read-only body into a shared frontend component. Validate canonical gavel-draft v1/v2 before rendering anything; retain its 1 MiB, 5,000-node and depth-16 limits. Reject unknown nodes/attributes, unsafe links, cycles and unsupported versions without raw JSON, HTML or Markdown fallback.
- Render paragraphs, h2/h3, strong/emphasis, safe links, breaks, ordered/unordered lists, quotes and images/captions as explicit React elements. Never spread stored attributes or load the editor/Tiptap bundle.
- Inject checked media resolution. Public adapter constructs only the public image route from article/asset UUIDs and matching positive bounded dimensions. Private adapter preserves private preview URLs and the existing no-article-ID image description fallback. Shared rendering contains no hardcoded private URL.
- Resolve all required media before rendering the body. An unavailable/invalid supplied descriptor produces a generic body-unavailable result, not partial private text or an arbitrary image URL. If no resolver is supplied, the generic component renders plain image descriptions for the private fallback.
- Public prose styling is reader-scoped; shared image/overflow safety remains modest and private text rendering stays behaviorally compatible. Public images preserve dimensions, alt and captions and avoid the image optimizer.
- No article route or database/authorization changes; Task 12 owns article-page composition.

## Steps and validation

1. Add failing tests for supported v1/v2 semantics, escaping, unsafe protocols/attributes, unknown nodes, missing/invalid media, bounded deep/large documents and private behavior.
2. Extract the renderer, add public/private adapters and scoped CSS, and run focused renderer/editor/contract checks plus type/lint/format.
3. Review once; exercise a removed synthetic Chromium fixture for narrow/desktop prose, image dimensions, links and no-JavaScript output. Build without the fixture and verify no editor runtime import is added.
4. Update authoritative component/design docs and status, commit coherent pieces and open a main-targeting draft PR. Human rich-content/accessibility review remains pending.

## Verification evidence

- Nineteen focused shared/public/private renderer and editor-component tests passed. Canonical TypeScript/PostgreSQL parity passed 214 cases; real-editor round-trip checks passed eight cases.
- Removed synthetic Chromium fixture passed JS and no-JS at 320/1440px: semantic headings/lists, safe external links/focus, literal captions, decoded public images with width/height, no horizontal overflow, and private noscript route preservation.
- One security-focused review found no actionable issues. Static import inspection found no editor/Tiptap runtime dependency in shared/public rendering. Lint required separating preflight try/catch from JSX construction; validation now returns a tagged preparation result before rendering.
- The temporary route/server and its generated development types were removed before the production build. No database schema/authorization changes were made, so database suites beyond the relevant canonical parity checks were not repeated.
- Human rich-content/screen-reader approval and exact screenshot reconciliation remain outstanding. Task 12 owns article-page composition.

- Final unit suite passed all 704 tests. Production build, TypeScript, lint and formatting passed. The build contains no synthetic fixture route.
