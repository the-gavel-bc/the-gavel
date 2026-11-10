# Phase 5 Task 8 — public reader shell

Status: implemented and verified locally on `feat/public-reader-shell`, based on Task 7 PR #56. The PR targets main and requires Task 7 integration.

## Acceptance and risks

- Move homepage files into the public route group, preserving `/`. Its layout alone loads the cookie-free public site projection into one shell; protected/auth data loading remains unchanged.
- Adapt demo masthead/navigation/footer with reader-scoped styles and a text masthead while logo provenance is unresolved. Render configured active sections/categories, including News when configured, with canonical category URLs.
- Native GET search, links and disclosures work without JavaScript. Mobile starts expanded without JavaScript and progressively collapses; desktop stays open. Escape closes the nearest disclosure and restores summary focus.
- Render supplied mission/contact/Instagram and submission navigation only. A typed Read This slot remains absent until Task 10 supplies stories. Unknown copy/links stay absent.
- Preserve one header/main/footer and skip target on public and auth pages. Unavailable public data gives honest feedback without fake taxonomy. No schema, authorization, dependency or logo import changes.

## Verification

1. Add focused navigation/footer/layout tests for canonical URLs, active states, native search, Escape/focus and absent values.
2. Implement browser-safe shared types, public layout and shell; run component/auth-shell, type/lint/format checks.
3. Review once; verify desktop/mobile keyboard and no-JavaScript links using a temporary fixture, then remove it. Build the actual app and verify root/auth composition.
4. Update component/design docs and status, commit coherent pieces and open a main-targeting draft PR. Human accessibility/branding review remains pending.

## Verification evidence

- Eight focused unit/component tests passed, including layout data handoff, unavailable data, canonical categories, Escape focus, contact URI encoding, footer slots and single-shell homepage/auth presentation.
- The focused production Playwright suite passed four cases (desktop/mobile): one shell/main, keyboard menu closure, native search attributes, and no-JavaScript sign-in. Its web-server command also passed the production build.
- A removed synthetic Chromium fixture checked News/category links, nested Escape focus, native GET search submission, no horizontal overflow at 320/1440px, JavaScript-disabled navigation and recovery after resizing a closed menu.
- Review found reserved email characters needed mailto URI encoding; the fix and regression passed. Browser proof exposed a second-Escape issue at a closed nested disclosure; using the nearest open disclosure fixed it and tests passed.
- TypeScript and lint passed. Final format checks are recorded before PR. No database schema or authorization changed, so database tests were not repeated. Human accessibility/branding signoff remains outstanding; no screenshot approval is claimed.

- Final `pnpm exec vitest run --maxWorkers=2` passed all 688 tests. Production build, TypeScript, lint and format checks passed.

## CI follow-up (2026-11-10)

The inherited homepage foundation test still clicked the removed Sections label and assumed a hardcoded Features link. It now keyboard-opens the progressively enhanced mobile Menu and checks static primary links/current state, native search, visible focus and overflow without assuming seeded taxonomy. The focus helper now measures the nearest nontransparent surrounding surface instead of always the body, retaining its width and 3:1 contrast assertions for white focus rings on the blue navigation band.

The six homepage/reader-shell desktop/mobile tests passed. Five of six additional focus-helper usage cases passed initially; a desktop draft-create case tried to focus its temporarily disabled submit button and passed unchanged in isolation. Targeted lint/format passed. No product behavior changed and hosted CI was not monitored.
