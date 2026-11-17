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

| Task | Scope | Acceptance |
| --- | --- | --- |
| T0 In-page confirmation | A shared accessible confirmation dialog (native `<dialog>`) replaces `window.confirm` in the editor Cancel, memberships, taxonomy and tags. | Cancel never flickers: native dialogs are auto-dismissed by automated browsers and some embedded views, which made Cancel do nothing. Keyboard: Escape cancels, focus returns to the trigger. |
| T1 Memberships redesign | Search bar on top; filter pills with **All** first and the default; cleaner one-row-per-person layout; role change and removal tucked into a compact control. | `All` pill is active with no query; each pill shows a count; search keeps the active pill; no "Membership activity" link on this page. |
| T2 Per-person activity | A person's name links to that person's activity page. | The page lists only that person's events (listing, role changes, claim, deactivation), including events from before they signed in. |
| T3 Taxonomy page | Remove the "Article management" link; creating a section can add its first category in the same step; cleaner rows. | Optional category name creates the category under the new section; partial failure is reported honestly. |
| T4 Delete taxonomy | Delete sections and categories with confirmation. | Blocked while any story (any status) uses the item; a section deletes with its categories only when none of them is in use; audited; exact retries replay. |
| T5 Editor text | Remove the contributors explainer text in the editor. | Field labels unchanged. |
| T6 Profile photo | A person can add a photo on their profile; it shows in the author About section. | Image type and size checked on the server; only the owner can change it; public sees only a finalized photo; removal supported. |

Design risks: T4 deletes data, so it is limited to unused items and is irreversible except by recreating; T6 adds storage, so it reuses the existing image processing, bucket policy style and request receipts rather than a new service.
