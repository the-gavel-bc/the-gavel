# Plan: publication date field in the article editor

Status: implemented in three slices (database, contract and editor, docs). The browser test is deferred (see docs/code-reviews/DEFERRED.md). Owner decisions (2026-11-19): the field is the **publication date shown to readers**; **whoever can edit the article may set it, locked after publication except for administrators**; **today or earlier only** (no scheduling); **date only, interpreted in Eastern time**.

The lifecycle follow-up preserves the merged backfill and defines clear and restore behavior in the [API contract](../../api-contracts.md#implemented-draft-form-adapter). Historical design notes follow.

## Behavior

- A date input in the editor's metadata section (create and edit), labeled "Publication date (optional)" with help text: "Readers see this date. Leave blank to use the day you publish. It cannot be in the future."
- Blank means "the day it is published". A date earlier than today backdates the story.
- Allowed to set: anyone who may edit the article (author on an unsubmitted draft, editor on an article in review, administrator always). After publication only an administrator can change it, which is already true for every published edit.
- The date may not be after today in Eastern time. This is enforced when saving and again when publishing.
- On publish: if the date is blank or today, `published_at = now()`. If it is earlier, `published_at` is that date at 12:00 Eastern, so public ordering, listings, search, the homepage and the sitemap need no change.
- Changing the date of a published article (administrator) updates `published_at` the same way and records a revision and audit event like any published edit.

## Data model

- New nullable column `articles.publication_date date` (the author's chosen date; null means "use the publish day"). Backfill published rows from `published_at` in Eastern time. Column select grant for `authenticated`.
- `published_at` stays the single value public queries order by. No public RPC changes.
- Not a time-dependent CHECK constraint (the "not in the future" rule depends on now); enforced in the functions below.

## Contract changes (the risky part)

The draft input is a strict, versioned contract with canonical JSON, fingerprints and request receipts, so the change must be additive and replay-safe.

- `DraftInput` gains `publicationDate: string | null` (`YYYY-MM-DD`). `schemaVersion` stays 1 because the key is optional on input.
- `private.check_draft_input` accepts the key as absent, null or a real calendar date not after today in Eastern time; anything else is `invalid_input`. An absent key is treated as null.
- Canonical form: a null `publicationDate` is stripped before hashing so fingerprints of in-flight requests from older clients still match during rollout.
- `create_article_draft`, `save_article_draft`, `save_published_article` write the column and include it in no-op detection (a save that only changes the date is a real change and bumps the version).
- `private.capture_draft_snapshot` adds `publicationDate`, so revisions and the save functions' stored-versus-input comparison stay consistent.
- `private.transition_article` publish branch sets `published_at` by the rule above and re-checks the date is not in the future.
- Generated database types regenerated; the field error key `publicationDate` added to the zod field-error enums (draft actions, lifecycle result).

## Interface

- `DraftMetadataFields`: native `<input type="date">` with a visible label, help text via `aria-describedby`, error text associated with the input, `max` set to today's Eastern date (computed with `Intl`, not the browser's local date).
- Draft form state, dirty tracking, reload and conflict-recovery comparison, selections helper and the editor detail query all carry the new field.
- Read-only view for people who cannot edit shows the date as text. Admin article detail shows it.
- Reader publication dates use Eastern time after the [reader date follow-up](2026-11-19-review-fixes.md#2-eastern-reader-dates).

## Risks and how they are handled

- Retry and double submit: the date is part of the fingerprint, so an exact retry replays and a changed date with the same request id returns `request_conflict`.
- Conflict recovery: the conflict panel lists the date as a compared field so a stale tab cannot silently overwrite it.
- Midnight crossing: validation uses the database's Eastern date at the time of the call; the client `max` is advisory.
- Rollout: old clients omit the key (accepted); new clients send it. Deploy the database first.
- Pagination: changing a published article's date reorders it; keyset cursors may skip or repeat one item for a reader mid-pagination. Accepted (administrator-only, rare).
- Permissions: no new authority; the existing `article_authority` edit modes decide who can save, so the date follows them. Tests prove the denials.

## Slices (small, independently reviewable)

1. Database: column, backfill, `check_draft_input`, create and save functions, snapshot, publish rule, types, pgTAP.
2. Contract and editor: `DraftInput`, form field, state, conflict panel, detail query, read-only display, Vitest.
3. Verification and docs: Playwright flow, product-requirements, api-contracts, data-model, ADR 0013 (publication date semantics), backfill note.

## Acceptance criteria and verification

- A blank date publishes with `published_at` within seconds of now; today's date does the same; a past date yields 12:00 Eastern of that date.
- A future date is rejected on save and on publish (pgTAP for each).
- An older client payload without the key still saves and publishes (pgTAP).
- Changing only the date is a real change (version bump, revision, audit); resending the same payload is a no-op replay.
- A backdated article sorts by that date in the public list RPC, search, the homepage and the sitemap (pgTAP using the public list RPC).
- Author on an unsubmitted draft, editor on an article in review and administrator may set it; author in review, editor on an unsubmitted draft and anyone on a published article except an administrator are denied (pgTAP).
- Accessibility: label, description and error are associated; usable by keyboard; works on a phone viewport (browser check).
- Browser (Playwright): create a draft with a past date, submit, publish as editor, and see the date on the public article and in the listing.
- Checks to run: typecheck, lint, format, unit tests, pgTAP for the touched files on a cleared database, `pnpm db:types:check`, the new Playwright spec.

## Out of scope

Scheduled publishing, time of day, per-section default dates, bulk date edits, and showing an "updated" date.

## Open items

None blocking. If the owner later wants a visible "Updated" date or scheduling, that is a separate plan.
