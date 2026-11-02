# 0008: Use checked editorial lifecycle operations

- Status: Accepted for Phase 4 planning; implementation pending
- Date: 2026-11-01
- Related requirements: [Phase 4 editorial contract](../superpowers/specs/2026-11-01-editorial-workflow-design.md), [implementation plan](../superpowers/plans/2026-10-29-phase-four-editorial-controls.md), [security rules](../security-and-permissions.md)
- Supersedes / superseded by: Extends [ADR 0007](0007-private-draft-editor-and-mutations.md); no earlier decision is replaced

## Context

The private draft system has checked, versioned create/save operations and closed article writes. Publishing, archive/restore, media, membership administration, and public slug stability need equally explicit authority and history. Foundation membership grants are a known direct-write exception.

## Decision

Use narrow, user-scoped operations with database identity and ownership checks, expected article versions, request receipts, and atomic article/revision/audit effects. Published edits retain status and `published_at`; archived records require administrator restore before editing. Publication readiness must hold for every committed published row. Article slugs derive from draft titles and freeze at first publication; author-page slugs derive from display names and freeze after their first published association. Neither slug is an editable field. Administrator membership mutations must replace direct application writes with checked, audited operations and protect the last eligible active administrator.

## Alternatives considered

Direct table grants for administrators cannot require one receipt and audit event per operation. One generic mutation function would combine unrelated authority and validation rules behind a broad interface. Neither fits the existing draft boundary.

## Consequences

Each operation needs its own focused migration, denial and concurrency tests, and form action. Existing stored slugs and published URLs are preserved. Media, video, taxonomy, settings, and deletion each retain the client decision gates named in the contract. No service-role application client or external service is introduced.

## Validation

The owner answered the slug, archived-edit, last-administrator and reference rules, then directed work to continue with the proposed contract on 2026-11-01. This record establishes the implementation approach only; it does not claim the operations or their tests exist.
