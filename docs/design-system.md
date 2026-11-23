# Design system

Status: The public reader matches the owner's desktop homepage screenshots as of Phase 5 Task 22 (2026-11-11). Mobile and non-homepage visual signoff, and human screen-reader review, remain pending.

## Direction

Preserve the existing Gavel logo, blue/black/white palette, publication structure, and editorial character shown in repository screenshots and the live site. Improvements may strengthen hierarchy, readability, responsive behavior, accessibility, navigation, consistency, and dashboard usability without making the publication feel unrelated.

## Foundations

- Display/editorial typography should retain the newspaper character; interface controls and body text must prioritize readability.
- Use semantic color roles rather than raw colors inside components.
- Maintain strong text contrast and visible interactive states.
- Use a consistent spacing scale and content-width system.
- Article reading width should remain comfortable on large screens.
- Mobile layouts reflow rather than shrink desktop arrangements.
- Exact color, font, spacing, radius, shadow, and breakpoint tokens will be documented from approved assets during implementation.

## Core patterns

- Header: logo, primary sections, category dropdowns, search, and accessible mobile menu.
- Cards: image, title, date, excerpt, and clear linked target.
- Archives: heading, optional description, result count when useful, cards, and pagination.
- Article: image/credit, title, byline, date, content, contributors, taxonomy, author profile, related articles, and latest/search sidebar where layout allows. Reader publication dates use the Eastern calendar day. Machine-readable timestamps retain the original publication instant.
- Forms: persistent labels, instructions, inline errors, summary for submission errors, and clear required/optional status.
- Dialogs: reserve for short confirmations; permanent deletion requires explicit article identification.
- Feedback: distinct loading, empty, error, success, disabled, and unsaved states.
- Motion: subtle and functional; honor `prefers-reduced-motion`.

## Accessibility

Target WCAG 2.2 AA.

- All functionality works with keyboard input.
- Focus order follows visual and reading order.
- Focus indicators are clearly visible.
- Menus and dialogs expose appropriate names, roles, states, and escape behavior.
- Headings form a logical hierarchy.
- Images require meaningful alt text or an explicit decorative designation.
- Image credits and captions remain available to assistive technology.
- Form errors are associated with fields and announced appropriately.
- Color is never the only indication of state.
- Touch targets and spacing support mobile use.
- Automated checks supplement, not replace, manual keyboard and screen-reader review.

## Content and copy

- Use plain, direct interface language.
- Distinguish Archive from Permanently Delete.
- Confirm destructive actions with the affected title.
- Do not expose internal errors or security details.
- Preserve editorial punctuation and names accurately.

## Phase 5 visual reference

The owner identified `/Users/dylandrozario/Desktop/work/testing/demo-gavel-frontend` as the public-reader UI reference on 2026-11-09. Its static HTML/CSS supplies candidate masthead, navigation, hero, cards, archives, article/prose and footer patterns; the [Phase 5 plan](superpowers/plans/2026-11-09-phase-five-public-reader.md#demo-inventory-and-adaptation-map) maps these to app components. Its color/font values and assets are candidates subject to contrast, licensing and owner review, not approved global replacements. Keep dashboard styles isolated. Further screenshots will refine layout and visual signoff; do not import demo policy copy, content, auth behavior or taxonomy as design approval.

## Implemented reader primitives

ReaderSurface owns local reader tokens; ArticleGrid and ArticleCard must render within it. The demo-inspired palette uses ink #14161c, muted #5d6470, deep blue #1e4aa8, white and soft #eef2fc. Normal text contrast against its backgrounds ranges from 5.32:1 to 18.08:1. Local spacing roles and a 0.625rem image radius accompany Georgia editorial type and system sans-serif metadata. No external font, network font request or unverified logo was added.

Grids use one column below 45rem, two from 45rem, and four from 70rem. Thumbnails reserve a 3:2 region and retain intrinsic dimensions; cards show a truthful absence placeholder. Titles wrap without truncation, credits remain visible, and no animation is introduced. Scoped focus rings and native links support keyboard use. These choices are provisional pending the owner's screenshots and branding provenance; human screen-reader review remains outstanding.

## Public shell implementation

Task 8 adds a serif text masthead, deep-blue navigation band and dark footer using scoped CSS Modules with reader-token fallbacks. This replaces no dashboard styles and imports no unverified logo or external font. Native navigation/search and 44px minimum-height controls support keyboard and mobile use. Category disclosures expand in document flow to avoid clipping long labels. Mission paragraph breaks are preserved as plain text. Final logo/assets, screenshots and human accessibility approval remain pending.

## Homepage presentation

Task 10 uses the reader tokens for a large serif lead, a Latest column above 56rem, a soft-blue Featured News band and section card grids. Single-story/text-only heroes use a centered reading-friendly width. Headlines wrap without truncation, image regions reserve 3:2 space and credits remain visible. No new logo/font/media asset or motion is introduced. Partial groups render actual stories only; exact screenshot reconciliation and human visual approval remain pending.

## Article body presentation

Task 11 adds reader-scoped prose with serif text, h2/h3 hierarchy, semantic quotes/lists, underlined safe links, responsive intrinsic-size images and plain-text captions. Public image dimensions come from checked descriptors. Shared rendering adds only local overflow/image constraints so private previews retain their typography. No external font, raw HTML or editor runtime is added to public rendering. Human rich-content and screen-reader review remain pending.

## Screenshot reconciliation (Task 22)

Owner-approved on 2026-11-11 and implemented against the nine desktop homepage screenshots, using the demo frontend's components as the structural reference:

- **Brand:** the official logo (`src/frontend/assets/brand/gavel-logo.png`, tagline included) is the centered masthead. The gavel mark is the favicon, the Apple touch icon and the decorative placeholder for stories without an image (a blue tile instead of "No image" text).
- **Type:** Playfair Display for headings and Source Serif 4 for body text, self-hosted as committed variable latin WOFF2 files in `src/frontend/assets/fonts` (SIL OFL 1.1, licenses alongside) and loaded with `next/font/local` (`--font-display`, `--font-body`), so builds never fetch fonts, so no third-party request is made and the CSP's `font-src 'self'` holds. Interface labels stay system sans-serif. Dashboard typography is unchanged.
- **Colour:** the live band blue (`#6b8bd9`) gives white text only 3.32:1, so navigation and the Featured band use `#4a72cf` (4.57:1), the nearest AA-compliant shade. Social pills use brand colours with AA text: Instagram `#c13584`, Spotify `#1db954` with dark text, LinkedIn `#0a66c2`, Facebook `#1665cc`.
- **Homepage:** centered uppercase navigation with caret category dropdowns; a lead image with the headline and date overlaid on a dark gradient, plus three thumbnail stories beside it; a full-width blue Featured News band with compact thumbnail rows; section rows with large headings, "View All →" and image/title/date/excerpt cards; a centered Stay Connected block listing only configured social links.
- **Footer:** black, three columns. The Gavel (fixed "Est. 2009", configured mission, email and labelled social icons), Useful Links (uppercase) and Read This cards with thumbnails, then a bottom row with copyright and the member sign-in link (moved from the masthead).
- **Kept from the app, not the live site:** photo credits stay visible; archive and search cards keep section labels and bylines (the compact card variant is homepage-only); search stays a native form in the navigation band; no Newsletter link, WordPress credit or policy links.
- **CSP:** logo and mark use plain `<img>` with statically imported files, because `next/image` adds an inline `style` attribute the nonce policy blocks.

Verified at 1440px and 375px in a production build: one `h1`, no heading-level jumps, all images with alt text (decorative ones empty), no unnamed links, single main/footer landmarks, keyboard-operable category dropdown with visible focus, no horizontal scroll, both fonts served from this origin and no CSP violations on the homepage, archives and search. Article, archive, author, search and About pages had no screenshots and keep the earlier treatment with the new fonts.

Navigation follow-up (2026-11-12): the menu follows the live taxonomy (no top-level News). Dropdowns use a 5px navy (`#1f2380`) top rule, a square white panel and 17px bold items; the Letter to the Editor dropdown links How to Submit. The How to Submit page has a full-width dark banner, the live illustration and the live heading.

## Dashboard refresh (2026-11-12)

Slice 1 of the [UI/UX refresh plan](superpowers/plans/2026-11-12-ui-ux-refresh.md):

- **Shell:** logo header with the signed-in name and Sign out.
- **Navigation:** a sidebar with Workspace and Admin groups listing every dashboard page. The current page has `aria-current="page"` and an accent bar. Below 42rem the sidebar becomes a horizontally scrolling chip row that keeps the current page in view.
- **Tokens:** dashboard tokens live on `DashboardShell`:
  - Ink `#14161c`.
  - Muted `#5d6470` (5.57:1 on the `#f6f7fb` page).
  - Accent `#1e4aa8` (8.08:1 with white).
  - Field border `#848d9c` (3.35:1 non-text contrast).
  - Danger `#b3261e` on `#fdf1f0` (5.92:1).
- **Base styles:** zero-specificity `:where()` base styles give unclassed labels stacked above fields; 44px fields, buttons and links; pill buttons, filled for submit and outlined otherwise; card forms; tinted status and alert messages; and tables. Feature module classes always override them.
- **Fonts:** interface text uses the system sans stack, and headings use the reader display font. No font was added.

Slice 2:

- **Status badges:** a text label plus tint. Draft is `#8a4b00` on `#fff4e0` (6.24:1), Published `#1e6b3a` on `#e8f5ec` (5.81:1), Archived `#4a515c` on `#eceef2` (6.89:1).
- **Lists:** article lists use card rows with a pill action, and the admin filters form a toolbar.
- **Editor:**
  - It groups details in a card.
  - A sticky save bar holds the save status, the visibility note and the save button.
  - Formatting buttons appear above the editor and show their pressed state.

## Reader refresh (2026-11-13)

From the [reader refresh plan](superpowers/plans/2026-11-13-reader-refresh.md), following the demo frontend:

- **Motion tokens on `ReaderSurface`:**
  - `--reader-ease` is `cubic-bezier(0.2, 0.7, 0.2, 1)`.
  - Durations: `--reader-fast` 180ms for hover and press, `--reader-medium` 260ms for entrances and panels, `--reader-slow` 500ms for image zoom.
  - `--reader-shadow` is the shared shadow.
  - Reduced-motion settings zero the reader duration tokens. Components with standalone animations disable those animations in their own styles.
- **Cards:** rounded image frames zoom 3–6% on hover, and titles turn blue.
- **Skeletons:** story image frames shimmer until the photo paints. A navigation that takes longer than 1.5 seconds shows a skeleton shaped like the destination: home, article, archive, author, search or information page. Reader routes keep no `loading.tsx`, so 404 responses stay 404.
- **Navigation:**
  - On desktop the band is sticky, with pill hover states and a filled, underlined current pill. Dropdowns animate open.
  - On mobile it is a compact bar with a hamburger that folds into a cross and a full-width panel.
  - Search is an icon that expands into a field. Without JavaScript the menu stays in flow and an empty search opens the search page.
- **Article:** a navy (`#1f2380`) scroll-driven reading progress bar, a section kicker, sans metadata, topic chips, a soft author card and a Keep reading block.
- **Archives and pages:**
  - Archive headings use uppercase crumbs, a large title and a 2px ink rule.
  - Chips and pagination are pill controls.
  - Stay Connected is a soft-blue band.
  - Footer cards and icons lift on hover.

Previews (2026-11-13, owner direction): story cards, the hero, Latest, Featured and search results show the image, then a small byline and date side by side (plain text inside the story link), then the title and summary, plus a section label on archive cards. Photo credits appear on the article page only. Every preview title turns blue on hover with no underline; the hero uses light blue `#b8cbf7` over its dark overlay. Featured News items are full-size stories sitting directly on the band, with no card box: a rounded image, then a white byline and date, then the title, which turns pale blue (`#dfe8ff`) on hover. This supersedes "photo credits stay visible" in Task 22 for previews. Summaries are clamped to two or three lines. Category and topic chips are slim pills (about 31px) whose tap target is extended to 44px with a pseudo-element. Dropdown hover changes only the category name (blue and underlined), with no highlighted block. The Featured News band's content uses the page container box, so it lines up with the section rows.

Accessibility fixes (2026-11-14): the reader's default link focus ring is low-specificity (`:where`), so components on blue or dark backgrounds set a white ring. Navigation pills and the desk shortcut use darker fills (`rgb(20 22 28 / 16–36%)`) so white text stays above 4.5:1. Featured byline text is solid white. The image shimmer runs four times, then stops. The hero overlay is at least 72% dark where the title starts. Reader pages set `scroll-padding-top` for the sticky band.

Layout polish (2026-11-14): articles use one 46rem reading column with a plain-text "By … · date" line under the summary. Section archives lead with a full-width split story (photo beside the text from 56rem) instead of an overlay hero. Below 45rem, homepage section rows and Featured News show the first story full size and the rest as compact rows. The How to Submit illustration is capped at 22rem tall with 46rem text. Search titles mark matched words with the soft-blue token.

Desk fixes (2026-11-14): destructive actions use an outlined red style (`Button variant="danger"`), never the primary fill. Dashboard actions use the shared button styles. Status pills share semantic color tokens and keep visible text labels. On coarse pointers, controls use a minimum 44 px target. Forced-colors mode uses system focus colors and native select arrows. Dark mode is deferred. The editor save bar can wrap on small screens, and the formatting toolbar sits above the scrollable article body.

Desk directories (2026-11-16): Memberships and Taxonomy share `admin-list` styles (toolbar card, card rows, state badges), matching the article lists. Desk timestamps are shown in Eastern time with an "ET" label.

Homepage curation (2026-11-17): the desk page mirrors the public homepage with a lead slot and two rows of four cards (image, title, left and right arrows, remove), dashed tiles for empty slots, a sticky save bar, and a horizontal library of published stories with search and arrow paging. Buttons add stories, remove picks, and reorder picks within a row. Dragging also moves picks across groups. Button moves are announced in a polite live region.
