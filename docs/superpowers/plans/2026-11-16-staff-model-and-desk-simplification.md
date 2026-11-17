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
