# Staff access, credits, taxonomy and desk simplification

> Keep decisions and evidence here. Related: [security and permissions](../../security-and-permissions.md), [data model](../../data-model.md), [reader refresh plan](2026-11-13-reader-refresh.md).

**Goal:** Make the desk work for a newsroom of 100+ staff. Access comes from an administrator's email list, not from approval queues. One-off credits no longer create profiles. Administrators manage the whole taxonomy. The editor, homepage and directories are simpler and less cluttered.

## Owner requests (2026-11-16)

1. Authors can cancel their edits in an article.
2. No "pending" state. Administrators list BC emails with roles, and can edit them.
3. No stored guest contributors; one-off credits are typed by the person making the article.
4. Administrators can create and update sections, categories and tags.
5. A Memberships page that shows each role clearly and works at 100+ staff.
6. A simpler, more intuitive homepage page with less text.
7. Smaller pills on admin pages.
8. A tighter article-creation layout.

## Decisions

Answered by the owner on 2026-11-16:

- **Unlisted sign-in:** a person whose BC email is not on the list sees an "access not approved" page. Nothing is stored about them, so there is no pending queue and no attempts list.
- **Adding staff:** an administrator adds a BC email with a role (Author or Administrator) before that person has ever signed in. The role applies automatically at their first sign-in. Administrators can later change the role or deactivate.
- **Existing guest contributors:** converted to plain-text credits on their articles. Guest author pages stop existing, so those `/authors/...` URLs return 404. Member authors keep their pages.
- **Taxonomy:** administrators create, rename, reorder and deactivate sections and categories. Tags can be renamed, merged and deleted when unused. Anything referenced by published or archived articles can be deactivated but not deleted.

Defaults chosen here (flagged so the owner can overrule):

- **Display name at invitation is optional.** Bulk onboarding would otherwise need a name per email. The name comes from the person's Google profile at first sign-in, and they can edit it on their own profile page.
- **Bulk add is included.** Pasting many emails at once is the realistic way to onboard 100+ staff.
- **Cancel means discard unsaved edits.** On an existing article it returns the form to the last saved version after a confirmation; on a new draft it leaves without saving. Saved versions are never deleted.

## Discussion-required changes

The project rules require discussion first for the authorization model, destructive migrations and public URL changes. The owner's answers above cover:

- the authorization model (an email list replaces approval),
- the guest conversion and retired guest URLs (a data migration and URL removal),
- new administrator write operations on taxonomy.

Each is its own slice with its own migration, so any one can be reviewed or reverted separately.

## Slices (stacked PRs)

1. **Desk simplification (UI only):** cancel edits, compact pills on the desk, a simpler homepage page, a condensed editor layout. No schema or contract change.
2. **Email list access and the Memberships page:** an invitations table, claim-at-sign-in, removal of the pending state, a search-and-filter Memberships directory with inline roles, bulk add.
3. **One-off credits:** typed credits stored on the article, conversion of existing guests, retired guest pages.
4. **Taxonomy administration:** create and edit RPCs and screens for sections, categories and tags, plus unused-tag cleanup.

## Design risks and acceptance (slice-level detail is added as each slice starts)

- **Access can never be broader than before:** a signed-in person still needs a confirmed `bc.edu` Google identity; the list only replaces the approval click. Last-administrator protection stays.
- **Race safety:** list changes and first sign-in claims serialize on the existing membership lock; exact retries replay and conflicting payloads return `request_conflict`.
- **No loss of history:** existing members, profiles, audit events and receipts are untouched.
- **Accessibility and security:** keep labels and accessible names stable where browser tests rely on them; test role and ownership denials for every new operation.

## Verification record

**Slice 1 (desk simplification):** compact desk controls via `--dash-control` (2.25rem on fine pointers at 48rem+, 2.75rem on touch), a secondary Cancel button in the editor save bar (confirms only when unsaved edits exist; saved versions untouched), shorter field hints, two-column metadata on wide screens, inline category choices, and a one-line homepage-curation intro. Labels and accessible names that browser tests use are unchanged. Run locally: typecheck, lint, prettier, the full unit suite and a production build. Playwright suites for drafts and the homepage were not run locally (they need the primary database); CI covers them.

**Slice 2 (staff email list):** migration `20261116010000_staff_email_list.sql` adds the listing table, `invite_staff`, `change_invitation_role`, `remove_invitation`, `claim_invitation`, `list_staff`, `staff_summary`, extended audit reader and audit actions, and drops `list_membership_candidates`. `getCurrentAccess()` claims a matching listing before deciding. The public URL `/access-pending` and the internal `pending` access status keep their names (no URL change, no churn in 27 files); only the visible wording changed to "Access not approved". The Memberships page now has role/state counts, search, role and state filters, a collapsible bulk add (one role per batch, optional name per line), and compact rows with role and state tags and inline role change, deactivate or remove. Reactivation of a deactivated member reuses `approve_membership`. Deliberate limits: listings of existing members are skipped and reported (edit them in their row); a deactivated member whose address is later listed again is not auto-reactivated (use Reactivate). Local checks run: pgTAP file 062 (33 tests) and the existing 022 and 024 pass on the disposable database; the full pgTAP suite also showed failures in unrelated article, profile and media files on that seeded disposable database (for example slug collisions with seeded authors), which CI's clean database does not have.

**Slice 3 (one-off credits):** migrations `20261116020000_one_off_credits.sql` and `20261116020100_remove_contributor_admin.sql`. Design choice (flag for the owner): credits stay as profile rows without an account instead of a new text column, because creating, saving, snapshots, revisions, restore and the public projections all carry credits as profile references; replacing that contract would rewrite about ten SQL functions plus the shared draft contract. The visible behavior asked for is delivered: typed names are one-offs (never matched or reused by name, not searchable), guest author pages are retired (404, no sitemap entry, no archive), and bylines show plain-text names. The administrator Contributors page and its RPCs were removed. The projection changes patch existing function definitions in place and the migration fails if any expected pattern is missing. Orphaned credit-only rows are not deleted (revisions may refer to them). Tests: pgTAP 042, 047 and 058 updated and a new byline-slug assertion; unit tests for credits rendering; removed tests for the retired admin surface. 058 tests 8 and 9 failed before and after this change on the seeded disposable database.

**Slice 4 (taxonomy administration):** migration `20261116030000_taxonomy_create_and_tags.sql` adds `create_taxonomy`, `rename_tag`, `merge_tags`, `delete_unused_tag`, audit actions and the tag "in use" flag. Rename, reorder (navigation order field) and deactivate for sections and categories already existed and are unchanged. **Open decision for the owner:** the owner's answer allowed deactivating anything, but the existing rule blocks deactivating a section or category while published or archived stories use it, because an inactive section hides its stories from readers. That rule is kept; allowing it with a warning is a small follow-up. Other limits: tag merge targets are the tags on the current page (50 per page); old revisions may still name a merged or deleted tag. Tests: pgTAP 063 (26 checks) with the existing 026; unit tests for the action, schemas and controls.

## Round 2 (2026-11-17): desk polish tasks

Owner feedback after reviewing the stack. Built on branch `feat/desk-polish`, one commit per task. The `pro-ui-ux-max` skill was not available in this session, so the design pass follows the existing design tokens and the earlier audit.

| Task                    | Scope                                                                                                                                                         | Acceptance                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0 In-page confirmation | A shared accessible confirmation dialog (native `<dialog>`) replaces `window.confirm` in the editor Cancel, memberships, taxonomy and tags.                   | Cancel never flickers: native dialogs are auto-dismissed by automated browsers and some embedded views, which made Cancel do nothing. Keyboard: Escape cancels, focus returns to the trigger. |
| T1 Memberships redesign | Search bar on top; filter pills with **All** first and the default; cleaner one-row-per-person layout; role change and removal tucked into a compact control. | `All` pill is active with no query; each pill shows a count; search keeps the active pill; no "Membership activity" link on this page.                                                        |
| T2 Per-person activity  | A person's name links to that person's activity page.                                                                                                         | The page lists only that person's events (listing, role changes, claim, deactivation), including events from before they signed in.                                                           |
| T3 Taxonomy page        | Remove the "Article management" link; creating a section can add its first category in the same step; cleaner rows.                                           | Optional category name creates the category under the new section; partial failure is reported honestly.                                                                                      |
| T4 Delete taxonomy      | Delete sections and categories with confirmation.                                                                                                             | Blocked while any story (any status) uses the item; a section deletes with its categories only when none of them is in use; audited; exact retries replay.                                    |
| T5 Editor text          | Remove the contributors explainer text in the editor.                                                                                                         | Field labels unchanged.                                                                                                                                                                       |
| T6 Profile photo        | A person can add a photo on their profile; it shows in the author About section.                                                                              | Image type and size checked on the server; only the owner can change it; public sees only a finalized photo; removal supported.                                                               |

Design risks: T4 deletes data, so it is limited to unused items and is irreversible except by recreating; T6 adds storage, so it reuses the existing image processing, bucket policy style and request receipts rather than a new service.

**Round 2 notes:** photos are stored in the database (small, no Storage policy) rather than a new bucket. The in-page confirmation replaces `window.confirm` in the editor Cancel, memberships, taxonomy and tags only; other screens (homepage, lifecycle, media, deletion, profile reload, navigation guard) still use the browser dialog. Taxonomy deletion is blocked while any story of any status uses the item, and a section is deleted together with its (unused) categories. Per-person activity is `?user=<member id or listing id>` on the activity page.

## Round 3 (2026-11-17): homepage curation redesign (plan only, not built)

Done already in this round: the in-page "Article management" links are removed (homepage, activity and media pages; the sidebar keeps them), and the author URL text is removed from the profile form. The sidebar's "Article activity" entry is untouched; there was no in-page activity link to remove.

**Goal:** the admin homepage page looks like the real homepage and has almost no text. Curators arrange stories in horizontal rows, using arrows, drag, or search-and-add.

**Layout (top to bottom)**

1. **Lead** slot: one large card (image, title, section), same proportions as the live hero.
2. **Featured News** row: four slots in a horizontal strip, like the live featured band.
3. **Read This** row: four slots in a strip.
4. **Stories library:** a search field and a horizontal strip of published stories with left and right arrows to page through them (replacing the vertical text list and Next/First page buttons).
5. **Save bar** (sticky): "Unsaved changes", Discard and Save. The long explanatory paragraphs, the "No curated stories" text and the saved-preview block go away; a slot's empty state is a dashed "Add story" tile.

**Interactions**

- Each filled card shows a left arrow, a right arrow (shift order within its row; disabled at the ends) and a remove button. These are the keyboard and touch path, so every action works without dragging.
- Drag a card to reorder inside a row or to move it between Featured, Read This and Lead; drop on a full row is refused with a short message; dropping on Lead swaps the old lead into the dragged card's slot. Uses the browser's native drag and drop, no new dependency.
- Library cards: click "Add" for a small menu (Lead, Featured News, Read This), or drag the card into a slot or empty tile.
- Arrow buttons keep stable accessible names for tests: "Move X left in Featured News", "Move X right in Featured News", "Remove X from Featured News", "Set X as lead", "Add X to Featured News", "Add X to Read This". A polite live region announces moves and drops.

**Unchanged:** the save contract (expected version, request id, exact retry, conflict reload, one story once, up to four per row, published only) and the navigation guard. No schema or API contract change beyond the open question below.

**Slices (each reviewed once before the next)**

- **H1 Layout and slots:** page structure, slot cards, arrows and remove, sticky save bar, text removed. Acceptance: existing save, retry and conflict behaviour and tests still pass; rows scroll horizontally at phone width.
- **H2 Library strip:** search, arrow paging, Add menu. Acceptance: search keeps its character limits; adding respects the four-per-row and once-only rules; paging never loses unsaved selections.
- **H3 Drag and drop:** reorder, move between rows, swap on lead, announcements. Acceptance: touch devices still work through the arrows; drop refusals are explained.
- **H4 Tests and docs:** unit tests for move/swap/limits, browser spec update (arrow names), design-system note, screenshots of desktop and phone.

**Open decisions for the owner**

1. **Images on cards.** The live homepage is image-led. Admin cards need each story's main image, which the curation and story-list queries do not return today. Recommended: add the main-image id to those two reads (small SQL change, existing authorized preview route serves the image). Alternative: text-only cards with section and date.
2. **Drop on a full row:** refuse (recommended) or replace the last card.
3. **Library size:** show 12 stories per page in the strip (recommended) or keep the current page size.

**Design risks:** drag and drop is not accessible alone, so arrows are mandatory and tested; horizontal strips can hide cards on small screens, so arrows stay visible and keyboard focus scrolls the card into view; reordering must never lose the version/request-id retry guarantees.

**Round 3 built (2026-11-17), recommended decisions used:** cards show the story's main image (read through `article_main_images` and the public image route, no SQL change; a story without one shows a plain tile); a drop on a full row is refused with a message; the library shows 12 stories per page. The library loads pages with a server action and keeps pages already seen, so the arrows move back without refetching and staged choices are never lost. Arrangement rules (add, remove, shift, drag, lead swap, four-per-row, once-only) are pure functions with unit tests. The save contract, version, request id, retry and conflict handling are unchanged; Reload now uses the in-page confirmation. The page title is now "Homepage" and the saved-preview block is gone. Native HTML drag and drop is used; touch devices rely on the arrow and add buttons.

**Round 4 (2026-11-17), reader polish:** the scroll-in "rise" animation on cards is removed; the article page no longer ends with a "Search stories" link; the homepage lead is the biggest story (full-bleed image, section pill, headline and date, about 1.7 times the width of Latest, which now has a visible heading, square thumbnails and dates only); opening nav search grows the field in the row so the links make room (links tighten to stay on one line) instead of floating over them; plain reader links are styled (pill buttons for page actions, accent text links, footer links with hover underline). Every remaining browser `confirm()` on the desk (publish, archive, restore, delete, remove image, discard upload, load saved version, reloads) is now the in-page dialog, because automated browsers silently dismiss native dialogs. Only the leave-page warning still uses the browser dialog.

**Round 5 (2026-11-17):** the homepage lead is landscape (3:2) instead of tall; the public article drops the "Article owner" credit and the byline names link to author pages; the reading bar is tied to the article itself (a named CSS view timeline), so it is full when the article ends, not the page; the contributors editor works again (a floated legend was pushing the rows off the card); Media cleanup uses stat tiles, a health chip and a details list; article rows get Edit, Archive (published), and for administrators Restore and Delete (archived), all behind in-page confirmations, while "Unpublish" is not added because archiving is how an article leaves public view; View archives is a pill link; Article activity gets a search box (article title, person, or date such as 2026-11-13, Nov 13 2026 or 11/13/2026) through `list_article_audit_events(…, p_search)` in migration `20261117040000_article_audit_search.sql`, with pgTAP 065.

## Round 6 (2026-11-17): automatic expiry of unused images (owner approved: 7 days, both cases)

**Decision (owner):** unused article images are deleted automatically after 7 days, both ones that were never attached and ones that were attached and later replaced. The manual "Delete image" button stays as "delete now".

**Rule.** A finalized image is expired only when all hold: it was finalized more than 7 days ago; it is not in the article's current body or main image; no retained saved version (revision) references it; its article is a draft or published (archived articles keep their media so they can be restored); and nobody holds a lock on the article or image at that moment (rows are claimed with `skip locked`, so an open editor or save wins and the image is picked up on a later run). Uploads that never finished (pending or uploading) are not touched. Consequence of "no saved version references it": a replaced image still used by an older saved version is kept, which preserves restores.

**Mechanism.** A daily cron route, separate from the retired-media sweep so each has its own time budget, claims up to 25 images per batch through a service-role-only function that marks them `deleting` under the same locks as manual removal. The route then deletes the Storage objects and calls a completion function that re-checks every condition, requires the object to be gone, and deletes the row. The existing key registry and cleanup ledger keep watching those locations for late writes. Each expiry is recorded in `private.media_expiry_log`. Failures leave the image in `deleting`, and the next run retries it.

**Acceptance.** pgTAP covers: old unreferenced images are claimed; recent, referenced (main, body, revision), uploading and archived-article images are not; locked rows are skipped; completion refuses while the object exists or a reference appears; the function is not callable by anon or authenticated. Unit tests cover the cron route's secret and environment checks and the sweep loop's partial failures.

**Risks.** A mistaken delete is permanent, so every condition is re-checked at completion; the 7-day grace period and the revision rule are the safety margin. Retention can be tuned by changing one constant.
