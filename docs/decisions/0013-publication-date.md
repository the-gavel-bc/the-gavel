# 0013: Publication date as an optional Eastern calendar date

- Status: Accepted
- Date: 2026-11-19
- Related requirements: [plan](../superpowers/plans/2026-11-19-publication-date-field.md), [API contract](../api-contracts.md)
- Supersedes: none

## Context

Editors need to set the date readers see (for example when republishing an older story). Public queries, listings, search, the homepage and the sitemap already order and display `published_at`.

## Decision

Add an optional `publication_date date` (Eastern calendar date, never in the future). Keep `published_at` as the single value public code uses and derive it from the date when publishing: now for today, noon Eastern for an earlier date. The field is an additive, optional key of the draft input; null is stripped from the canonical form so older clients' fingerprints still match. The future-date rule is time dependent, so it lives in stable functions, not constraints or the immutable input check. Whoever may edit the article may set its date. After publication only administrators may edit it. See the [API contract](../api-contracts.md#implemented-draft-form-adapter) for clear and restore behavior.

## Alternatives considered

- Overwrite `published_at` directly from the form: loses "blank means the publish day", and a timestamp with a time-of-day is more precision than the owner wanted.
- Scheduled publishing: rejected by the owner for now (needs a job and a new state).
- A second date column that only the interface reads: public ordering would not follow it.

## Consequences

- Backdating moves a story in listings; a reader paginating at that moment could see one item skipped or repeated (administrator-only after publication, rare).
- Dates in the past are never rejected, so old stored values stay valid.
