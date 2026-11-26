# Plan: dashboard navigation, icon buttons and spacing

Status: built 2026-11-26 on `feat/dashboard-navigation-icons`.

## Audit findings

Screenshots of every dashboard page at 1280px and 390px (admin account, local stack):

1. **Back navigation was inconsistent.** The editor had "Back to My articles" at the very bottom of a long form (wrong for admins who came from Article management). Article details had "Back to article management" at the bottom. Membership history had a "← Memberships" text link above the heading. Other nested pages had none.
2. **No dashboard icon set.** Only the reader's `site-icons` existed; homepage arrows and remove were Unicode characters (←, →, ×).
3. **The editor toolbar** used twelve text pills over two rows, pushing the body box down.
4. **Taxonomy rows** repeated "Edit" and "Delete" pills on every row.
5. **Admin article cards** stacked title, a four-column detail row and actions vertically: about 110px per article with empty space on the right.
6. **The mobile header** stacked logo, "Signed in as" and Sign out into three rows (about 220px) before any content.
7. **Homepage library cards** clipped their "Read" chip on narrow cards.

## Decisions

- **Back arrow:** shown only on nested pages (editor, new draft, article details, membership history), at the top left of the main area as "← <page name>", named "Back to <page>". Top-level pages are reached from the sidebar, so they get none. When the previous page in this tab was a dashboard page, the arrow links to that exact URL, so its filters and search are kept. It is a plain link, so it also works without JavaScript; scroll position is not restored. After a full page load it links to the parent list. It never returns to the empty new-draft form. It goes through the existing unsaved-changes guard.
- **Icons:** one inline SVG set (`src/frontend/components/ui/icons`) built on the reader's existing `Icon` base: 24px grid, 2px stroke, `currentColor`, decorative. No icon library was added.
- **`IconButton`:** wraps `Button`. Its `label` is both the accessible name and a tooltip shown on hover and keyboard focus (hidden on touch-only devices).
- **Icon-only where the meaning is unambiguous:** editor formatting (¶, H2, H3, quote, lists, B, I, line break, link, unlink, image), taxonomy edit/close/delete, homepage move/remove and library paging.
- **Text kept where an icon would be ambiguous:** Archive, Restore, permanent Delete of articles (the design system requires Archive and Delete to stay distinct), Deactivate, role changes, the homepage Lead / Featured / Read This choices, filters and save actions.
- **Image description (2026-11-26, owner request):** the main image and body image each have one "Alt text and caption" field. It is saved as both the alt text and the caption. Readers see it under the photo; where the caption repeats the alt text, the reader hides the caption from screen readers so it is not read twice. Older photos keep their stored caption until their details are next updated.
- **Correction placement:** the Correction section is now inside the editor, after the fields and above the sticky save bar, so the bar no longer sits on top of it. It still saves on its own (it is a section with its own button, not a nested form).
- **Link field:** the toolbar shows a link icon only. Pressing it (or editing an existing link, which pre-fills the address) opens the URL field with Apply link and Cancel; Enter applies, Escape closes, and a valid link closes the field.
- **File pickers:** every dashboard file input's "Choose File" button is styled as an outlined pill through `::file-selector-button`; the native input and its keyboard behaviour are unchanged.
- **Spacing:** admin article actions sit beside the title and details from 52rem; the phone header is one row with a truncated name; homepage library chips wrap instead of clipping.

## Acceptance criteria

- Nested pages show one back arrow; top-level pages show none.
- From a filtered list, editing an article and pressing the arrow returns to the same filtered URL.
- Unsaved editor changes still prompt before the arrow navigates.
- Every icon-only button has an accessible name equal to its previous text name, so keyboard, screen reader and test lookups are unchanged.
- No horizontal page scroll at 390px.

## Verification

- Unit: `back-link.test.ts` (top-level, fallback, filtered history, new-draft exclusion); existing toolbar, taxonomy and homepage tests unchanged by name.
- Browser: new `admin-articles.spec.ts` back-arrow journey; `draft-conflict-recovery.spec.ts` covers the unsaved-changes guard on "Back to My articles".
- Desktop and phone screenshots of the changed pages.
