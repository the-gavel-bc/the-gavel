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
- Self-host Playfair Display (headings) and Source Serif 4 (body) through `next/font`, so the browser makes no third-party request and the CSP stays `'self'`. Both are OFL licensed.
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

Pending.
