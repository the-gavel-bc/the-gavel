# 0006: Store structured content behind a closed write boundary

- Status: Accepted
- Date: 2026-10-21
- Related requirements: [Accepted content contract](../superpowers/specs/2026-10-21-content-foundation-design.md), [Phase 2 plan](../superpowers/plans/2026-10-20-phase-two-content-foundation.md)
- Supersedes / superseded by: None

## Context

Phase 2 needs article storage and private read permissions before an editor, renderer, upload flow, or atomic mutation/history implementation exists. The owner approved the concrete contract after reviewing the proposal and excerpt/slug explanation.

## Decision

Use bounded nullable JSONB for article content, with no editor library chosen yet. Keep all new application write grants and mutation RPCs closed, including administrator writes, in the data-only phase. Use explicit grants/RLS for catalog and owner/admin reads. The linked contract is authoritative for accepted limits, relationships, and history visibility; do not duplicate them here.

## Alternatives considered

Sanitized HTML was not selected. Direct application writes or full atomic mutation functions would expand this phase into the editor/workflow slice. Neither JSONB nor a byte bound establishes rich-content safety.

## Consequences

Later writes/rendering require a closed content schema, URL/embed validation, safe output, actor derivation, and atomic audit/revision capture before those interfaces are exposed. Format/constraint changes need compatibility proof for existing data. No speculative extension system or new dependency is needed. Existing unresolved retention, tag-entry normalization, and infrastructure identity-deletion questions remain open.

## Validation

Taxonomy, private article storage, and category links are implemented in Tasks 2–4 with direct SQL bounds, reference, role/ownership, and write-denial tests. Tag/credit associations, history storage, and final clean/upgrade proof remain tracked in Tasks 5–7. No mutation, safe renderer, or automatic history capture is implemented. See the task plan and testing documentation for commands actually run; do not infer completion of later gates.
