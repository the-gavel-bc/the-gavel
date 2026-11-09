# Product requirements

Status: Approved design; application and membership-access foundation implemented. Publishing MVP remains planned.

## Purpose and users

The Gavel is a public student-journalism website for Boston College. It replaces a compromised WordPress installation with a focused, security-first publishing platform that preserves the publication's existing identity while improving usability, accessibility, and maintainability.

- Public readers browse published work without an account.
- Approved `bc.edu` members create and manage content.
- Authors manage only articles they own.
- Administrators manage the publication, membership, and all content.
- Credited writers, editors, and creative contributors do not need login accounts unless they require dashboard access.

Success means readers can reliably discover and read articles, approved members can publish safely, unauthorized users cannot access editorial data, and future club leadership can operate and recover the service without relying on one student.

## MVP scope

### Public experience

- Responsive homepage matching the current site's structure, logo, colors, and editorial character.
- One administrator-selected lead story and a configurable Featured News group, with newest-article fallbacks.
- Homepage curation uses one lead, up to four Featured News stories, and up to four Read This stories. Any published article may be selected, with no story repeated across slots. Missing or archived selections fall back to the newest published stories not already reserved or shown. The owner confirmed these rules on 2026-11-07.
- Homepage groups for News, Features, Opinions, Culture, Sports, and Allston–Brighton.
- Published article pages with title, owner/writer credits, publication date, main graphic and credit, rich article body, contributor credits, author biography, categories, tags, same-section related stories, search, and recent stories.
- Section, category, tag, author, search, and Letter to the Editor archive pages with pagination.
- Public author pages with biography, optional profile image, and published articles.
- About page containing publication history and mission.
- Letter to the Editor archive plus a separate How to Submit page.
- Search across published titles, descriptions, bodies, writers, sections, categories, and tags.
- Configurable footer with mission, contact email, social links, navigation, and selected Read This stories.
- Custom not-found page with search and a route home.

### Editorial dashboard

- Google sign-in restricted to `bc.edu` accounts.
- Explicit administrator approval before dashboard access.
- My Articles listing.
- Create, edit, save draft, publish now, and archive owned articles.
- Rich content supporting headings, paragraphs, emphasis, links, quotations, lists, images, captions, and approved video providers.
- One designated owner, one primary section, zero or more categories, zero or more tags, and zero or more credited contributors per article.
- SEO keyphrase, meta description, and search-result preview.
- Personal public-profile editing.
- Administrator management of all articles, memberships, contributor profiles, taxonomy, homepage selections, site information, and audit history.
- Administrator-only permanent deletion of archived articles.

## Content organization

Each article has exactly one primary section. It may also have multiple administrator-defined categories and multiple topic tags.

| Section              | Initial navigation categories                             |
| -------------------- | --------------------------------------------------------- |
| News                 | Initial categories to be confirmed during content setup   |
| Features             | On Campus, Outside of BC, Authentic Eagles                |
| Opinions             | Beyond Campus, Campus POV                                 |
| Culture              | Politics and Activism, Arts and Entertainment             |
| Sports               | Football, Hockey, Basketball, Press Pass                  |
| Allston–Brighton     | News, Culture and Community                               |
| Letter to the Editor | Published letters; submission guidance is a separate page |

Categories organize editorial navigation. Tags describe specific topics and may span sections.

## Content lifecycle

```text
Draft -> Published -> Archived -> Permanently deleted
```

- Authors may create, edit, publish, and archive only articles they own.
- Additional credited contributors do not gain edit permission.
- Administrators may manage every article and restore archived articles.
- Only administrators may permanently delete an archived article.
- Permanent deletion requires explicit confirmation and an audit event.
- Media is deleted only when no retained article references it.

## Roles

### Public reader

- Read and search published content.
- Browse sections, categories, tags, authors, and letters.
- Cannot access drafts, archives, or the dashboard.

### Author

- Must use an approved `bc.edu` Google account.
- Create articles and manage only articles they own.
- Publish immediately; editorial approval is not required for the MVP.
- Manage their public biography and profile image.
- Cannot manage roles or permanently delete content.

### Administrator

- All author abilities across all content.
- Approve, deactivate, and assign application memberships.
- Manage contributors, taxonomy, homepage selections, editable site information, archives, and permanent deletion.
- Application-administrator status does not automatically grant GitHub, Vercel, Supabase, Google Cloud, DNS, or source-code access.

## Acceptance criteria

- Anonymous readers receive only published, non-archived content.
- An unapproved or non-`bc.edu` Google account cannot enter the dashboard.
- Authors cannot read or mutate another author's non-public article through the UI, server interface, or Supabase API.
- Authors cannot grant roles or permanently delete articles.
- Administrators can manage all content and memberships.
- Section/category/tag relationships remain valid and navigable.
- Unsanitized scripts, arbitrary HTML, unsafe embeds, and disallowed uploads cannot execute or be served as trusted content.
- Listings paginate and provide useful loading, empty, error, and not-found states.
- Public pages work across supported mobile, tablet, and desktop layouts and meet the accessibility target in `design-system.md`.
- Important authentication, membership, publication, archive, restore, and deletion actions are auditable.

## Deferred from MVP

- Comments; a later release will require `bc.edu` Google authentication and moderation controls.
- Newsletter signup integration.
- Scheduled publishing.
- Importing legacy WordPress articles or accounts.
- Public submissions through a Letter to the Editor form; the MVP provides instructions and uses the existing editorial intake process.

## Client questions to confirm before launch

- Confirm `Outside of BC` versus `Off Campus` as the final Features category label.
- Which initial News categories should be created?
- Which newsletter provider should be integrated after the MVP?
- What analytics service, if any, is permitted by Boston College?
- Who will own the domain, DNS, GitHub, Vercel, Supabase, Google OAuth, and billing accounts?
- Confirm production contact email, mission text, and social URLs.
- What Boston College privacy, branding, accessibility, records, or security policies apply?

Owner decision for archived deletion: an administrator may delete immediately after archiving. Revisions are deleted with the article; audit events keep article and actor identifiers, Auth accounts remain, and unreferenced images enter permanent recurring cleanup. Deletion is unavailable when the cleanup worker is unhealthy. Public slugs and article IDs stay reserved after deletion.

## Accepted Phase 5 navigation decisions

On 2026-11-09 the owner confirmed News belongs in main navigation. Category URLs use `/sections/[sectionSlug]/categories/[categorySlug]` because category slugs are unique within their section. This replaces the earlier proposed `/categories/[slug]`; no public category route has yet been implemented. The [Phase 5 plan](superpowers/plans/2026-11-09-phase-five-public-reader.md) records the public-reader work breakdown and demo UI reference.
