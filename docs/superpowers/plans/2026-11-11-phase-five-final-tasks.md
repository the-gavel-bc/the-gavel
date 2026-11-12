# Phase 5 Tasks 22–23 — visual reconciliation, accessibility and verification

> Keep decisions and evidence here. Spec: [Task 22](2026-11-09-phase-five-public-reader.md#task-22--screenshot-reconciliation-and-reader-accessibility), [Task 23](2026-11-09-phase-five-public-reader.md#task-23--integrated-public-reader-verification-and-handoff), [design system](../../design-system.md).

**Goal:** Bring the public reader close to the live Gavel homepage shown in the owner's screenshots, using the demo frontend's components as the reference; verify reader accessibility; then record integrated Phase 5 verification and an honest implemented/pending handoff.

## Inputs

- Owner screenshots (9, untracked in the primary checkout's `screenshots/`). All are **desktop** views of the live homepage:
  - masthead with logo and centered uppercase navigation band (`s10332`)
  - lead image hero with overlaid title plus three thumbnail side stories (`s10332`)
  - solid blue Featured News band with small thumbnails (`s10353`)
  - News, Features, Opinions, Sports and Culture rows with "View All →" (`s10426`, `s10438`, `s10452`, `s10503`, `s10517`)
  - centered Stay Connected buttons (`s10535`)
  - black three-column footer (`s10542`)
- No mobile screenshot and no article, archive, author, search or About screenshot exists. Those pages keep the current design-system treatment, and their visual signoff remains pending.
- Demo frontend `/Users/dylandrozario/Desktop/work/testing/demo-gavel-frontend` (static HTML/CSS) for component structure, tokens and assets.

## Owner decisions (2026-11-11)

- Use the official logo (`gavel-logo.png`, including its tagline) as the masthead, and the gavel mark (`icon-192.png`) for favicons and the no-image card placeholder.
- Self-host Playfair Display (headings) and Source Serif 4 (body) as committed WOFF2 files loaded with `next/font/local`, so the browser makes no third-party request and the CSP stays `'self'`. Both are OFL licensed.
- Add optional Spotify, LinkedIn and Facebook URLs to administrator site settings, validated to their official HTTPS hosts, and render them in Stay Connected and the footer.
- Show "Est. 2009" in the footer as fixed publication copy.
- Not adopted: the live Newsletter link (newsletter is unapproved scope), the "Designed with WordPress" bar, the demo's policy pages and its client-side search.

## Design risks and acceptance

- **Contrast:** white text on the live nav/Featured blue (about `#5b7fd6`) is roughly 3.6:1, below WCAG AA for normal text. Use the nearest darker blue that reaches 4.5:1 for text-bearing bands and record the deviation.
- **Contracts unchanged:** homepage data, curation rules, public projections, URLs, metadata, CSP and caching stay as they are. Visual changes are component/CSS only. Settings fields are the one contract change, and they are additive and nullable.
- **Images:** keep reserved aspect ratios, real alt text and the authorized media route. The hero overlay must keep the title readable without relying on the image (dark gradient plus text shadow) and fall back to a solid block when there is no image.
- **Accessibility:** one `h1` per page, ordered headings, visible focus, keyboard-operable navigation and disclosures, 200% zoom and 320px reflow without horizontal scroll, `prefers-reduced-motion` respected, decorative icons hidden from assistive technology. Human screen-reader review remains a separate gate.
- **No fabricated content:** buttons and links render only when their setting is configured.

## Slices

1. **Settings fields (own PR):** migration adding nullable `spotify_url`, `linkedin_url` and `facebook_url` with host-checked validation in save and the public projection, generated types, admin form fields, shared validation, and SQL/unit tests.
2. **Visual reconciliation and accessibility (own PR):** brand assets and fonts, masthead/nav, hero, Featured band, section rows, Stay Connected, footer and placeholder; then the accessibility pass and design-system notes.
3. **Task 23 record:** an evidence document collecting merged PRs, checks actually run, hosted/human gates and a concrete implemented/pending handoff. Owner-run CI covers the full suites.

## Verification plan

- Targeted locally: SQL tests for the settings fields; unit/component tests for changed components; production build; a browser comparison at 1440px against the screenshots plus 375px reflow; keyboard and contrast checks; a CSP-violation check on the new fonts and logo.
- CI runs the full unit, SQL, concurrency, contract and browser suites.

## Verification record

- Slice 1 (PR #85): SQL 69 files / 2,086 assertions; 27 targeted and 107 affected-area unit tests; typecheck, lint and format. Details in the PR.
- Slice 2 (this branch): unit 144 files / 1,001 tests, plus 3 new social-link/footer tests; typecheck, lint and format; production build. Browser checks at 1440px and 375px against seeded synthetic content in a disposable project: screenshot structure matched, accessibility checks passed, no horizontal scroll, no CSP violations after replacing `next/image` (it emits an inline `style` attribute the nonce policy blocks), and the keyboard dropdown works. Contrast was computed for every new colour pair. One E2E name assertion was updated for the logo link; CI runs the browser suite.
- Task 23: the archive/restore lifecycle across article, homepage, section, search, author and sitemap, and a draft-slug 404, were checked on the production build. The handoff is in [Phase 5 evidence](../../reviews/phase-5-public-reader.md).
- No scratch artifacts are committed; nothing ran against the primary local project.
- CI follow-up: the hosted production build failed inside `next/font/google` (Turbopack import-map error) though local builds passed. With owner approval the two variable latin WOFF2 files and their OFL licenses were downloaded from Google Fonts and committed, and the layout switched to `next/font/local`. A `CI=true` production build passed with both fonts bundled as same-origin assets and no Google references; fonts loaded with no external requests or console errors; unit (1,004), typecheck and lint passed. A committed `src/types/static-images.d.ts` also fixes CI typecheck, which runs before `next-env.d.ts` exists.

## Navigation and letters page follow-up (2026-11-12)

The owner supplied live dropdown and How to Submit screenshots and decided:

- **Taxonomy seeded by migration** (`20261112020000_live_site_taxonomy.sql`, idempotent, existing names untouched): Features (On Campus, Outside of BC, Authentic Eagles), Opinions (Beyond Campus, Campus POV), Culture (Politics and Activism, Arts and Entertainment), Sports (Football, Hockey, Basketball, Press Pass), Allston-Brighton (News, Culture and Community), Letter to the Editor. Admins have no create operation, so this is the only path for initial taxonomy.
- **No top-level News section**, matching the live menu (supersedes the 2026-11-09 decision). The homepage News row disappears because no News section exists.
- **Letter to the Editor dropdown** shows "How to Submit" (a page, not a category).
- **How to Submit page:** dark banner titled "How to Submit", the live illustration (cropped from the owner's screenshot into `src/frontend/assets/brand/letters-illustration.jpg`), heading "How to Submit to The Gavel’s Letter to the Editor" and the configured instructions. The Contact block is omitted there, as on the live page; About keeps it.

Dropdowns now use the live navy top rule, square panel and larger bold items. The navigation search is compact (icon button, name still "Search") so the whole menu fits on one line at 1440px.

Verification: SQL suite 70 files / 2,092 assertions passed with the seeded taxonomy, including a new `056_live_site_taxonomy` test of section order, categories, no News and public projection order. Unit 145 files / 1,006 tests, typecheck, lint and format passed (one existing navigation test file had been overwritten during editing and was restored with its three tests). Production build checks at 1440px and 375px: one-line desktop menu, live-style dropdowns, How to Submit item, page headings and illustration alt text, no horizontal scroll and no CSP violations.

CI follow-up (2026-11-12): the hosted browser run at `499db5a` failed `public-archives` "archives enforce public visibility…" on every retry. Archive pages promote their first story through `HomeHero`, and the homepage restyle had removed its section link, so `/letters` lost its in-page "Letter to the Editor" link. `HomeHero` now takes `showSection`, which archives pass. The seeded taxonomy also broke that spec's fixture, which refused to run whenever a "Letter to the Editor" section existed; it now reuses the seeded letters section. A temporary copy of the public-reader, home, reader-shell, security-header and access-boundary specs, pointed at a disposable project, passed for archives and every product case. Remaining failures there came from the copy's setup: a hard-coded `127.0.0.1:3100` origin, an email the run had changed, and the metadata fixture's image upload resolving to the primary project's Storage, which its cleanup removed. The resource-404 test is the documented expected failure. Unit 1,007, typecheck, lint and format pass.
