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

Pending: run once after slice 5.
