# Design system

Status: Approved direction — exact tokens await implementation and asset inspection.

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
- Article: image/credit, title, byline, date, content, contributors, taxonomy, author profile, related articles, and latest/search sidebar where layout allows.
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
