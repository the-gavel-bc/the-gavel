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
