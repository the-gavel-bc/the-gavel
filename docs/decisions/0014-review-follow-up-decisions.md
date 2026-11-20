# 0014: Decisions from the code reviews

- Status: Accepted
- Date: 2026-11-20
- Related requirements: [combined fix plan](../code-reviews/COMBINED-FIX-PLAN.md), [deferred register](../code-reviews/DEFERRED.md)
- Supersedes: none

## Context

The reviews of every area left open product and architecture questions. The owner delegated them with the instruction to choose what is best for the long term. This record fixes the answers so the fix plan and later work can proceed; building the larger ones is tracked in `DEFERRED.md`.

## Decisions

1. Restoring a backdated article re-checks the publication date, like submit and publish, so all transitions share one rule.
2. Contributor limit: five per article is a product rule enforced by the server (shared constant in the draft contract and the database). An article already above five (legacy) may be saved if its count does not increase. The hard safety bound of 32 stays.
3. Navigation and footer reads are cached for up to 60 seconds with on-demand revalidation when an article is published, archived or deleted, when the homepage is saved and when taxonomy changes, so staleness is normally zero and never more than a minute.
4. A retryable result code is added to the draft and lifecycle error contract for deadlocks, lock timeouts and serialization failures, so clients can retry safely instead of showing "unavailable".
5. Erasure policy for Auth users: records are anonymized, not deleted. Actor references in audit events and revisions become nullable with ON DELETE SET NULL; receipts and limits cascade; articles keep their owner profile (a profile can be deactivated and its personal fields cleared).
6. Homepage editor: it loads only the administrator's chosen picks; automatic filler is shown read-only as "automatic" and never becomes a pick by saving. Save and the library use the same eligibility rule as the public page (`is_homepage_card_eligible`).
7. Member profile moderation: an administrator-only function can blank a member's biography, reset the display name and hide the public page; deactivating a membership also hides the profile from public pages.
8. Retired tag, section and category URLs redirect (a `slug_redirects` table, as the data-model doc already describes) instead of returning 404. Merge and delete write a revision or version bump for affected published articles and an audit detail.
9. Crediting real members: any author may credit an active member on their own article; the editor review at publish (and the audit) is the control. A consent flow is out of scope; the rule is documented.
10. Caps: new tags per member 30 per day; unattached one-off credits per member 50 open; orphans older than 30 days are deleted; sections 100 active; all enforced in SQL with a clear conflict result.
11. `audit_events` is made immutable for every role, including the table owner and service role, by a trigger that rejects update, delete and truncate.
12. The Letter to the Editor page is keyed by a stable section slug (`letter-to-the-editor`), which cannot be renamed; section and tag slugs may not equal reserved public routes (`search`, `authors`, `tags`, `sections`, `letters`, `about`, `api`, `dashboard`, `sign-in`, `auth`, `sitemap.xml`, `robots.txt`).
13. Names that produce no Latin slug use a stable hash fallback (`n-` plus eight hex characters of the name's digest) instead of "article".
14. A save payload that omits `publicationDate` means "no date" (documented); every current client sends the key as read, and the version check narrows the risk. Authors may set the date on their own drafts (whoever can edit).
15. No dark mode for now (recorded in the design system); forced-colours support and 44 px touch targets for coarse pointers are required. One shared button component and shared status tokens replace the parallel systems.
16. JSON-LD omits credit-only writers on purpose (privacy); the media cleanup and unused-upload cron routes stay production-only.
17. `list_unused_article_uploads` and the three dead retired-media functions are dropped (no caller).
18. Hosted settings to verify and record (not code): email signup disabled so only Google sign-in exists; whether Google's `hd` claim is present for bc.edu accounts (require it if so); backup and point-in-time recovery plan.
19. Publication dates must be on or after 2000-01-01 in both TypeScript and SQL; publish confirmation shows the selected date, or today when blank.

## Consequences

Public URL redirects, cache revalidation hooks, new error code, caps and the immutability trigger are new surface that needs tests and documentation when built. Decisions 5, 7, 8, 10 and 11 involve migrations and are scheduled in `DEFERRED.md`, not built in the first fix batches.
