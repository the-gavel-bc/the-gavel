# Reader refresh: demo look, motion and skeleton loading

> Keep decisions and evidence here. Rules: [design system](../../design-system.md). Visual reference: the demo frontend (`demo-gavel-frontend/styles.css`). Research source: the ui-ux-pro-max skill data (MIT), used as reference only.

**Goal:** Make every public reader page feel like the demo frontend: rounded image cards with a gentle zoom on hover, pill tags, a sticky blue navigation band on desktop, a compact mobile bar, smooth hover and press feedback, staggered entrance on scroll, and skeleton placeholders while content loads. Data, URLs, permissions, metadata and HTTP status codes stay the same. The dashboard is out of scope.

## Owner direction (2026-11-13)

- Match the demo frontend's look and animation effects; use the ui-ux-pro-max guidance.
- Add skeleton loading, a dynamic and responsive feel, and appropriate sizing at every width.
- Build in slices, then test once at the end. Test only the specifics locally; CI covers the rest.
- Earlier decisions still apply: hamburger plus search icon on mobile, sticky navigation on desktop only.

## Design constraint: skeletons without loading boundaries

Article, archive, tag, author and letters routes must not add `loading.tsx`. Early streaming would turn later `notFound()` results into HTTP 200 ([component hierarchy](../../component-hierarchy.md)). So:

- **Navigation skeleton:** a client component in the reader shell shows a page-shaped skeleton (article or list) the moment a reader follows an internal link, until the new route renders. The server still resolves eligibility before sending anything, so status codes don't change. It clears on route change, on back/forward and after a timeout, so it can never get stuck.
- **Image skeleton:** every story image frame shimmers until the photo paints over it.
- With JavaScript disabled, pages behave as before.

## Motion rules (ui-ux-pro-max)

- Hover and press feedback takes 150–300ms. Images zoom 3–5% over 500ms, and the "View All" arrow nudges 4px.
- Entrance motion is scroll-driven CSS (`animation-timeline: view()`) where supported: a short fade-up, staggered naturally as items enter. Content is fully visible where it isn't supported.
- Skeleton shimmer loops every 1.4s.
- All motion is disabled under `prefers-reduced-motion: reduce`; skeletons then show a static tint.
- Every image keeps a reserved aspect ratio, so there is no layout shift.

## Slices

1. **Motion foundation and skeletons:** motion tokens, image shimmer, the navigation skeleton with a page fade-in, and card hover and entrance effects.
2. **Header:**
   - The navigation band is sticky on desktop, with a shadow.
   - Mobile shows a compact bar with a hamburger menu that slides down and a search icon that expands into a field.
   - Dropdowns animate open.
3. **Homepage:** hero zoom and pill label, Latest and Featured hover states, section rows, Stay Connected pill lift, and footer link and card polish.
4. **Article page:**
   - A reading progress bar, driven by scroll in CSS.
   - The section pill and header typography.
   - The rounded figure with its caption and credit.
   - Pill tag chips, and the related cards using the shared card effects.
5. **Archives, search, authors and information pages:**
   - Archive headings use the demo's browse heading with a rule; category chips get hover states; pagination becomes pill buttons.
   - The search form is restyled.
   - Author, About, How to Submit and not-found pages get the prose style.

## Acceptance

- No change to data, URLs, metadata, CSP or HTTP status. No route `loading.tsx` on reader routes.
- No inline styles, so the CSP holds. No new dependency or font.
- Keyboard focus stays visible; touch targets are at least 44px; existing accessible names are unchanged.
- No horizontal scroll at 320–375px; layouts reflow at 45rem and 70rem.
- Reduced motion turns every animation off.
- Unit tests cover the navigation skeleton's start and clear logic and the mobile search toggle.

## Verification record

Run once after slice 5, on the top of the stack, against the disposable `gavel-p5` project. It was seeded through the real draft, main-image and publish RPCs with 28 sample stories and generated WebP photos. The primary local project was not used.

- **Unit:** 75 files and 380 tests under `src/frontend` and `src/app` passed. They include new tests:
  - The navigation skeleton: link classification, show on click, clear on route change, ignore new-tab clicks, give up after 8s.
  - The expanding navigation search: first press opens instead of submitting, a press with text submits, Escape closes.
- **Fixed during testing:** three existing layout and not-found tests needed `useSearchParams` in their `next/navigation` mocks.
- **Static checks:** typecheck, lint, format check and the production build passed. The build caught a non-pure CSS Modules selector (`aside > h2`); it is now scoped.
- **Browser, production build, 1440px:**
  - The navigation band is `position: sticky` and stays on screen while scrolling.
  - Story images shimmer, then paint.
  - Following a story link shows the skeleton, then the article renders.
  - The reading progress bar tracks scroll; it read 72% at about 55% of the page. It was recoloured navy, because blue was invisible over the band.
  - The archive has the browse heading with a 2px rule and category chips.
  - The search page's Search button label wrapped; it now uses `nowrap`.
  - No CSP errors. The only console errors were 404s for seeded photos before their `no-store` metadata was set, which the real upload pipeline always sets.
- **Browser, 375px:**
  - The compact bar shows a hamburger and a search icon.
  - The menu opens as a full-width panel under the bar, and Escape closes it and returns focus to the button.
  - The search icon expands to a focused 272px field without navigating.
  - No horizontal scroll.
- **Screenshot timing:** the browser pane was hidden during part of the run, which throttles animations. Mobile behavior was therefore confirmed through DOM state rather than screenshots.
- **Not run locally:** the browser suite, whose fixtures target the primary local project; CI runs it. Accessible names the specs use are unchanged ("Menu", "Search", "Search stories", "Primary navigation", the banner landmark and `header details`).

## Follow-ups (2026-11-13)

Owner requests after the first review, in one PR on top of the stack:

- **Search expands to the right:**
  - On desktop the field grows rightward from the icon. When the band is short of room, the navigation row glides left just enough, never past its first item, so the field keeps its full 272px.
  - Mobile still opens leftward from the icon at the bar's edge.
- **Live suggestions:**
  - Typing two or more characters shows up to 6 matching stories in a panel under the field, with a status count and a "See all results" link. Arrow keys move between results, and Escape closes the panel.
  - **Decision:** suggestions reuse the bounded public search budget instead of adding an unbounded endpoint. A 300ms debounce, aborted stale requests and a 30-second cache on identical queries keep the cost near one search per typed query.
  - If the budget is exhausted, the panel says suggestions are unavailable and Enter still searches.
- **Hover dropdowns:** on desktop, mouse hover opens a section's categories and leaving closes them. Click, touch and keyboard still toggle.
- **Staff desk icon:**
  - Signed-in active members see an initials avatar and "Desk" at the end of the band, linking to `/dashboard`; on mobile it shows the avatar only.
  - It is loaded from `GET /api/session/desk` so that public Server Components never touch the session.
- **Navigation flash:** the route fade-in is removed, and the navigation skeleton now appears only when a navigation takes longer than 150ms. A browser trace across home → section → home → article saw no header remount and no skeleton on fast navigations.

Verification:

- **Unit:** 92 tests under the API routes, site components and reader features passed, including:
  - The desk route: no cookie, pending, error and active cases.
  - The suggestions route: field allowlist and status mapping.
  - Typing suggestions: debounce, links, arrow keys and Escape.
  - Hover dropdowns, and the delayed skeleton.
- **Static checks:** typecheck, lint, format and the production build passed.
- **Playwright against the production build on `gavel-p5`:**
  - Hover opens and closes a dropdown.
  - At 1440px the field spans 1152–1424px at its full 272px, and Home stays visible.
  - "eagles" listed 5 stories, and clicking one opened the article.
  - At 375px the field and panel stay inside the viewport, with no horizontal scroll.
  - The signed-in synthetic administrator saw "Your desk", which led to `/dashboard`; anonymous visitors got `{desk: null}`.
  - No console errors.

## Second follow-ups (2026-11-13)

- **Previews:** previews show only image, title and summary; bylines, dates and photo credits remain on the article page. The `story-meta` component and the calendar icon were removed as unused.
- **Category chips:** the breadcrumb `/` separator rule had leaked onto the category chips; it is now scoped to the breadcrumb list. Chips, topic chips and the archive section pill are slim, with 44px tap targets.
- **Dropdowns:** hover only recolours and underlines the category name.
- **Featured band:** its content was 24px wider on each side than the page (80–1360px against 104–1336px at 1440px). It now uses the container box and lines up exactly.
- **Duplicated pages:** `useSearchParams` in the navigation skeleton made the server render a fallback copy of every page and swap it in with a script. That doubled the HTML and could flash. The skeleton now keys on the page content itself, and the Suspense wrapper is gone.
- **Partial-word typing:** suggestions previously used whole-word full-text search, so nothing appeared until a word was complete.
  - **Decision:** add `suggest_public_articles`, a title-contains match that spends the same budget and returns the same allowlisted cards. Full search is unchanged.
  - It is a sequential scan over published titles, marked with a `ponytail:` note to add a `pg_trgm` index if the catalog grows.

Verification:

- **SQL:** `061_public_search_suggestions` and the existing `046_public_search` passed (63 assertions). They cover anonymous partial matches, the cap of 6, newest first, exclusion of drafts and archived stories, the card allowlist, short and blank input, literal `%` and `_`, and the direct-RPC guard.
- **Unit:** the full suite passed, 152 files and 1,036 tests. Typecheck, lint, format and the build passed.
- **Playwright against the production build on `gavel-p5`:**
  - The homepage HTML contains one copy of each section and no Suspense swap.
  - The Featured band and Features row both span 104–1336px.
  - No "Photo:", date or byline text appears in homepage or archive previews.
  - Hovering the Hockey item shows a transparent background with blue underlined text.
  - Typing "ea" shows 6 stories, and "dining pl" finds the dining story.
  - Chips render without separators at 31px tall.
  - No console errors.

## Third follow-ups (2026-11-13)

- **Skeleton timing:** the skeleton waited only 150ms, so ordinary server-rendered navigations (about 700ms locally) always showed it. It now appears only after 600ms.
- **Page-specific skeletons:** each page type has its own skeleton matching its layout:
  - **Home:** hero with Latest rows, the Featured band, a section row.
  - **Article:** a centred reading column.
  - **Archive:** crumbs, title, chips, a rule, the lead story and cards.
  - **Author:** the archive heading, a biography card and cards.
  - **Search:** heading, a pill field and button, cards.
  - **Information pages:** a prose column.
- **Previews:** a small byline and date sit side by side under every preview image. Photo credits stay off previews.
- **Hover:** every homepage preview turns blue on hover, with no underline; so do View All and the footer Read This cards.
- **Featured News:** items are now full-size cards, about 290×333px at 1440px, instead of small thumbnails.

Verification:

- **Unit:** the full suite passed, 153 files and 1,038 tests, including preview-meta tests, the skeleton mapping for every page type, and the 600ms threshold. Typecheck, lint and the build passed.
- **Playwright against the production build on `gavel-p5`:**
  - A normal 708ms navigation showed no skeleton.
  - With RSC responses delayed 2.5s, navigating to home, archive, About, an article, an author page and search each showed its own skeleton.
  - Hero and card titles turn blue on hover with no underline.
  - Featured cards measure 290×333px.
  - No console errors.
  - The search form itself submits as a full page load, which the harness cannot delay; its skeleton was verified through the client-side See all results link.

## Fourth follow-ups (2026-11-13)

- **Skeleton threshold:** raised from 600ms to 1.5 seconds, and the skeleton now fades in. Measured client navigations on the production build took 68–190ms, so it now appears only on genuinely slow loads. No skeleton appeared across five consecutive navigations.
- **Featured News:** items drop the white card box and sit directly on the band: a rounded image with a soft shadow, a white byline and date, then the title. Hover zooms the image and tints the title pale blue.
- **Verification:** reader unit tests (50), typecheck, lint, format and the build passed. The Featured band was checked by screenshot at 1440px.

## Skeleton arrival fix (2026-11-13)

**Bug:**

- The skeleton treated a change in the layout's `children` as "the new page arrived". In the App Router a layout's `children` is a stable router placeholder, so arrival was never detected.
- Every navigation within one layout group left a pending state behind. 1.5 seconds later, the skeleton covered the already-loaded page.
- Unit tests missed it because they swapped `children` by hand. The earlier browser checks missed it because Home ↔ About crosses the home and reader layout groups, which remounts the shell.

**Fix:** a navigation is now pending until the URL path or query changes. The router updates the URL in the same commit that renders the destination, and the check polls every 50ms while a navigation is pending. A page restored from the back/forward cache also clears any pending state.

**Tests:**

- **Unit:** 9 tests in `route-transition.test.tsx` use one stable `children` element, as Next does, and sample every 100ms so a late skeleton fails. They cover:
  - quick navigations, query-only changes and back/forward;
  - modified and new-tab clicks;
  - the 1.5-second threshold with the destination-shaped skeleton and its clearing;
  - stalls, the back/forward cache and GET form submissions.

  Against the previous implementation, 5 of the 9 fail.

- **Browser:** `e2e/reader-shell/route-skeleton.spec.ts` needs no fixtures. It watches for a skeleton for 2.5 seconds after each quick navigation within the reader layout (About → search → About) and across layouts (→ Home). It also delays one navigation by 3 seconds and expects the page-shaped skeleton, then the page, then no late skeleton.
  - Against a production build of the previous implementation, both cases fail on desktop.
  - Against the fix, all 4 runs (desktop and mobile) passed, 3 times in a row.
- **Sweep:** a scratch sweep over the seeded `gavel-p5` content saw no skeleton after any of 15 navigations: sections, category chips, articles, author pages, related stories, back/forward, letters, home and search.

## Mobile and tablet dropdown fix (2026-11-13)

Reproduced in Playwright at 390px (iPhone 13) and 810px (iPad) before fixing:

- **Phone:** opening a category list reflowed the row. The section name moved to mid-row, the caret floated above it, and a desktop-style white panel squeezed in beside it.
- **Tablet:** the wrapped two-row band let a dropdown run past the right edge of the screen.
- **Touch:** an open dropdown never closed, because there is no hover-out.
- **Desktop mouse:** hover opened a dropdown, and a click on its caret then toggled it shut.

Fixes:

- **Phone:** the section link fills its row with the caret pinned at the right edge. The open list drops below it as an indented white list inside the menu panel.
- **Tablet:** a dropdown that would overflow the viewport opens aligned to its section's right edge.
- **All widths:**
  - Only one dropdown can be open at a time.
  - A tap or click outside closes it.
  - Clicking the caret of a hover-opened dropdown keeps it open.

Verification:

- **Unit:** navigation tests now cover single-open, outside close and caret-after-hover, 17 site-component tests in all.
- **Browser:** the new fixture-free `e2e/reader-shell/navigation-dropdowns.spec.ts` runs at phone, tablet and desktop widths under both the desktop and mobile Playwright projects. It checks that:
  - opening a dropdown doesn't move the section link;
  - the list stays inside the viewport and the caret stays on the link's row;
  - there is no horizontal scroll;
  - an outside tap closes it;
  - choosing a category navigates.
- **Results:** together with the skeleton spec, all 10 cases passed three runs in a row on the production build against `gavel-p5`.
- **Flake fixed:** the first version of the layout assertion flaked on subpixel heights (44.00001 against 44). It now compares whole pixels.

## Research audit, batch 1: reader accessibility and performance fixes (2026-11-14)

Four read-only research agents audited the reader, accessibility and performance, the demo and live site, and the staff desk. The owner chose batch 1: nine reader fixes with no product decisions.

Fixes, each with its measured result on the production build against `gavel-p5`:

- **Mobile layout jump:** the server sends the mobile menu open for no-JavaScript readers, and hydration collapsed it after first paint. On a cold, throttled phone load (4x CPU, slow network) the layout-shift score was 0.388. With scripting on, CSS now hides the menu until it is enhanced (`@media (scripting: enabled)`). The score is now 0; the menu still opens on tap and still shows without JavaScript.
- **Endless shimmer:** the image skeleton looped forever behind loaded photos, costing about 16% of idle main-thread time. It now runs four times and parks off-frame; no shimmer animation was running after 7 seconds.
- **Focus rings:** the reader's default link ring outranked the white rings on the Featured band and footer (1.77:1 and 2.34:1). The default now uses `:where()`, so both show white rings; cards on white keep the blue ring.
- **Featured byline and date:** solid white, 4.57:1 (was 3.78:1).
- **Navigation pills:** current and hover pills use a darker fill instead of a lighter one. White text is now 6.44:1 on the current pill and 5.72:1 on hover (was about 3.1:1). The desk shortcut uses the same darker fill.
- **Sticky band over focus:** reader pages set `scroll-padding-top` (6.5rem while the band wraps to two rows, 4.5rem from 75rem). Shift+Tab through `/sections/sports` covered 0 of 12 focus stops (was 2).
- **Escape handling:**
  - In search, Escape returns focus to the search button (it used to drop to the page).
  - A hover-opened dropdown closes on Escape wherever focus is.
  - Tabbing out of a dropdown closes it; a click that moves focus nowhere does not.
- **404 titles:** not-found pages render their own `<title>`: "Page not found", "Article not found" or "Archive not found", each with "| The Gavel". Status stays 404.
- **Hero title over bright photos:** the overlay gradient reaches 72% at the title's top edge, with extra padding above for the ramp. Over a white photo that gives white text about 7:1 and the hover blue about 4:1 (calculated).

Verification:

- **Unit:** the full suite passed, 153 files and 1,046 tests, with new assertions for search focus return, Escape on a hover-opened dropdown and focus-out closing. Typecheck, lint, format and the build passed.
- **Browser:** the skeleton and dropdown specs passed, 10 of 10.
- **Not done in this batch:** under reduced motion, image hover still scales without animating (minor). Batches 2 and 3 and the owner-decision items from the audit are untouched.

## Research audit, batch 2: reader layout polish (2026-11-14)

Owner-approved batch from the research audit. Measured on the production build against `gavel-p5`.

- **Article page:**
  - A plain-text byline sits beside the date: "By {writers}", falling back to the article owner, as on previews. It is not a link, because existing browser tests locate author links on this page by name; the linked credits block is unchanged.
  - The header, photo, body, topics and author card now share one 46rem column (left edge 352px, width 736px at 1440px). Keep reading stays wide.
- **Section lead:** a new `ArchiveLead` replaces the overlay hero on archives. It spans the page (144–1296px, like the heading and cards), with the photo beside the byline, title and summary from 56rem. The section pill stays a link: over the photo's corner on small screens, above the byline on wide ones. `HomeHero` lost its now-unused section option.
- **Mobile homepage:** below 45rem, each section row and Featured News keep their first story full size and show the rest as compact rows (thumbnail beside byline and title, no summary). The homepage at 375px went from 14,677px to 9,083px tall.
- **How to Submit:** the illustration is capped at 22rem tall and the text at 46rem wide. At 1440×900 the first heading now starts at 813px, on the first screen (it was at 1,039px).
- **Smaller changes:**
  - The sticky band has a darker bottom edge, so it stays distinct over the Featured band.
  - An empty category page links to "See all {section} stories".
  - Search says "stories" throughout, and whole-word matches in result titles are marked.
  - The footer has a "Back to top" link (`#top`, no script).

Not done, on purpose:

- **Section labels on section archives stay.** The audit suggested dropping them as repetitive, but the design system keeps them and an existing archive browser test relies on that link.
- **The "Article owner" label in the credits block is unchanged.** Renaming or removing it is an owner decision.

Verification:

- **Unit:** frontend and app tests passed (403), with new tests for the byline, title highlighting (no HTML parsing, punctuation in queries), and the empty-state link. Typecheck, lint, format and the build passed.
- **Flake noted:** in one full-suite run, an unrelated dashboard page test failed once under load and passed 3 of 3 alone.
- **Browser:** measurements above; no horizontal scroll at 375px on home or a section; Back to top returns to 0 without a skeleton; no console errors. The skeleton and dropdown specs passed, 10 of 10.

## Research audit, batch 3: staff desk fixes (2026-11-14)

Owner-approved batch from the research audit. Checked signed in as the synthetic administrator on the production build against `gavel-p5`, browsing only; nothing was saved or published.

- **Mobile save bar:** at 375px the bar was 150px tall and covered focused fields. It is now one compact row, 62px tall: save status and button, with the visibility note hidden on small screens. The editor also sets `scroll-padding-bottom`. Tabbing through the editor, 0 of 35 focus stops were mostly covered.
- **Destructive actions:**
  - `Button` gains a `variant="danger"` (outlined red). Remove image and Archive article use it.
  - Plain dashboard buttons take `data-variant="danger"`; Deactivate contributor and Deactivate member use it.
  - Remove image asks for confirmation when the article is published. Drafts are unchanged, so the existing draft browser test needs no dialog handling.
- **Article management filters:** on phones the fields were about 105px tall, because a 12rem flex basis became a height in the column layout. They are 69px now (label plus field).
- **Article activity:** links show the article's current title ("View “…”") instead of its ID.
  - **Decision:** titles come from a second read of `articles` (id and title only) under the administrator's own session and the existing owner-or-admin read policy. No migration or RPC change was needed.
  - If that read fails, the list still renders with IDs.
- **Smaller fixes:**
  - Nested groups in the editor (categories, tags, contributors) no longer touch their neighbours.
  - Adjacent plain buttons have an 8px gap.
  - The formatting toolbar is sticky while writing.
  - Categories say "Choose a section first." before a section is picked.
  - The "Article body" label is bold like the other labels.

Not in this batch (larger, or needing a decision): a thumbnail for the attached photo, restyling Memberships, Contributors and Taxonomy to the refreshed card rows, Status and Search filters on My articles, simpler homepage-curation buttons, and showing times in Boston time instead of UTC.

Verification:

- **Unit:** the audit adapter and article component tests passed (163), with new tests for the title lookup and its failure fallback, and for the published Remove image confirmation and danger marking. The full suite passed, 153 files and 1,051 tests; typecheck, lint, format and the build passed.
- **Browser:** the measurements above, plus no horizontal scroll at 375px on Article management.

## Research audit: remaining staff desk items (2026-11-16)

The owner asked for the five desk items left out of batch 3. Checked signed in as the synthetic administrator on the production build against `gavel-p5`, browsing and filtering only; nothing was saved.

- **Attached photo thumbnail:** the editor shows the attached main photo (320px wide) above its alt text and credit. It loads from the existing private media route, so only the owner or an administrator can fetch it.
- **Times in Eastern time:** My articles, Article management, Article activity and Membership activity show `America/New_York` time with an "ET" label instead of UTC.
- **Homepage curation:**
  - Catalog buttons read "Set as lead", "Featured News" and "Read This". Their accessible names still include the story title, so existing tests and screen readers are unaffected.
  - The saved preview marks an automatic lead as "(automatic: newest story)".
- **My articles filters:**
  - A Status and title-search toolbar sits above the list, outside the "Your articles" region so its options are not mistaken for a row's status.
  - `getMyArticlesPage` takes `status` and `search`, validated with the same schemas as Article management (search allows only letters, digits, spaces, `'` and `-`). It stays owner-scoped.
  - **Decision:** the cursor is not bound to the filters. Page links carry both, and every row is the caller's own article.
  - Rows show the section name, which tells same-titled articles apart.
- **Memberships, Contributors and Taxonomy:**
  - All three use a shared `admin-list` style: a filter toolbar card, card rows and state badges (Pending approval, Active, Inactive, and Member profile or Guest contributor).
  - Pending membership requests come first on each page.
  - The contributor create form sits in a titled "New guest contributor" card.
  - Sections that fit on one page are listed in menu order.
  - Text content and control names are unchanged.

Verification:

- **Unit:** the full suite passed, 153 files and 1,057 tests. New tests cover the My articles filters (query parameters, rejected status and unsafe search, filtered empty state, next-page link) and the filters sitting outside the list region. Typecheck, lint, format and the build passed.
- **Caught by tests while building:**
  - `Intl.DateTimeFormat` rejects `timeZoneName` together with `dateStyle`, so "ET" is appended as text.
  - The list schema change briefly broke draft detail reads, which share the summary schema. The list now has its own schema.
  - The status filter's "Published" option collided with a row's status inside the list region, which an existing browser test relies on. The filters moved outside the region.
- **Browser:**
  - My articles listed 20 rows with section names and ET times; `status=published&search=eagles` returned the 5 matching stories; `status=draft&search=eagles` showed the filtered empty state; an unknown status showed the retry state.
  - The thumbnail loaded (1200px natural, 320px shown).
  - Sections were listed Features, Opinions, Culture, Sports, Allston-Brighton, Letter to the Editor.
  - No horizontal scroll at 375px on the five changed pages, and no console errors.
