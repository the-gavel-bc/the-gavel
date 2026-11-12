# UI/UX refresh: modern, low-friction dashboard and reader polish

> Keep decisions and evidence here. Rules: [design system](../../design-system.md). Research source: the ui-ux-pro-max skill (MIT, `nextlevelbuilder/ui-ux-pro-max-skill`), used as reference data only. Visual reference: the demo frontend's contributor desk.

**Goal:** Make the dashboard and admin pages feel modern and easy to use, then polish the reader's mobile navigation. Data, URLs, permissions and server behavior stay the same.

## Audit (2026-11-12, production build, 1440px and 375px)

- **Dashboard shell:** text-only header, no logo; the sidebar has no active state; Sign out sits below every page's content.
- **Admin navigation:** seven admin pages are reachable only from a run-together link row on Article management ("MembershipsContributorsSite information…"). Other admin pages give no way back except the browser's back button.
- **Forms:** labels, inputs and textareas fall back to browser defaults. Site information wraps fields inline and breaks at 375px. Buttons other than `Button` are unstyled native controls.
- **Reader mobile:** a "▶ MENU" disclosure plus a full-width search bar take about 110px before the first story.

Skill rules applied, from its priorities: visible labels and inline feedback (forms), 44px touch targets, an indicated active navigation state, consistent primary and secondary buttons, empty and loading feedback, 150–300ms hover transitions with reduced motion respected, and AA contrast.

## Owner decisions (2026-11-12)

- Do the dashboard first; the reader polish follows.
- Use the demo desk style: logo header, blue pill buttons, rounded field cards. Interface text uses the system sans font; no new font is added.
- Reader mobile: a compact bar with a menu button and a search icon that expands.
- The reader navigation is sticky on desktop only.

## Slices

1. **Dashboard shell and base styles (this PR):**
   - Logo header with "Signed in as" and Sign out.
   - A sidebar listing every destination, including each admin page, with `aria-current` for the active page.
   - Dashboard-scoped styles for labels, fields, buttons, alerts and status messages.
   - The run-together admin link row is removed. Accessible names are unchanged, so existing tests still find "Administration", "Article activity", "My articles" and "Sign out".
2. **Dashboard lists and editor:** status badges, article cards and rows, filter bar, editor section grouping, and a sticky save bar.
3. **Reader mobile navigation and sticky desktop band.**

## Acceptance

- No change to data, URLs, permissions or server actions. Authors never see admin links.
- Keyboard focus stays visible. The active page is announced with `aria-current="page"`. Touch targets are at least 44px.
- At 375px nothing scrolls horizontally, and every form stacks its label above the field.
- No CSP violations: there are no inline styles, and the logo uses a plain `<img>`.
- Unsaved-draft guards still apply to every navigation link and to Sign out.

## Verification record

Slice 1:

- Unit: 146 files and 1,010 tests passed, including 3 new navigation tests: current page, admin visibility, and no false match on a sibling prefix. Typecheck, lint and format passed.
- The production build was checked against the disposable `gavel-p5` Supabase project, signed in as the synthetic administrator:
  - 1440px: the sidebar marks the current page; Site information, Article management and New draft render as stacked card forms; keyboard focus on the sidebar is visible.
  - 375px: the chip row keeps the current page in view, nothing scrolls horizontally, and the fields stack.
  - No console or CSP errors.
- Not run locally: the browser suite. Its fixtures target the primary local project; CI runs it. Accessible names that the browser tests rely on are unchanged.

Slice 2:

- Unit: 146 files and 1,010 tests passed. Typecheck, lint and format passed.
- Production build at 1440px and 375px:
  - My articles and Article management show status badges and card rows with a pill action.
  - The admin filters sit on one toolbar row.
  - The editor's save bar stays on screen with the save result next to the button.
  - Formatting buttons are compact chips, filled when active.
  - Nothing scrolls horizontally, and there were no CSP errors. One expected connection error appeared from restarting the server.
- A floated legend initially pushed the editor fields sideways; a `clear` on the following content fixed it, confirmed in the browser.
- Accessible names are unchanged:
  - "Manage" keeps its `Manage article: <title>` label.
  - "Status", "Search article titles", "Apply filters" and "View archives" are kept.
  - The save live region only moved within the form.

## PR 89 attachment CI investigation

The repeated hosted failure waits for `Image attached.` in the desktop body-image cleanup case. Its logs omit the resulting application alert. The exact PR branch (`ad07e07`) was built against a clean disposable gavel-p5 schema; all four desktop body-image cases passed in sequence. The same attachment case also passed in a copied parallel suite explicitly retargeted to gavel-p5. These local passes do not establish a hosted fix.

The failing assertion now includes safe alert/status text on failure so the next hosted run identifies an RPC denial, conflict, or pending operation without logging credentials or draft payloads. Targeted ESLint/Prettier passed. No authorization, timeout, assertion condition, or product behavior changed. The primary local project was not used.

The diagnostic hosted run still reported `Image ready to attach.` with no nonempty alert after the setup click. Saving never became visible. Eight serialized desktop probes using different viewport heights, Arial metrics and CPU throttling passed locally, so the underlying hosted pointer behavior was not reproduced. The cleanup case now activates the native button with focus plus Enter. This keeps attachment as a real prerequisite and adds keyboard coverage; `article-media.spec.ts` retains pointer upload/attachment/unlink coverage. No timeout, retry, authorization, or cleanup assertion was weakened.

Verification: the exact PR 89 production build with its clean disposable schema passed all ten desktop/mobile `body-images.spec.ts` and `article-media.spec.ts` cases using copied fixture helpers retargeted only to gavel-p5. Command: `node node_modules/playwright/cli.js test --config /private/tmp/gavel-disposable-browser/playwright.config.ts body-images.spec.ts article-media.spec.ts`. Targeted ESLint, Prettier and `git diff --check` passed. Hosted CI remains the final gate for this change.
