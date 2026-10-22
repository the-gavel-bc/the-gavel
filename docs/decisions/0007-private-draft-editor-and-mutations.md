# 0007: Use a constrained editor and atomic private draft mutations

- Status: Accepted; implementation pending
- Date: 2026-10-22
- Related requirements: [Accepted Phase 3 contract](../superpowers/specs/2026-10-22-private-draft-workflow-design.md), [implementation plan](../superpowers/plans/2026-10-22-phase-three-private-drafts.md)
- Supersedes / superseded by: None; extends the data-only boundary in [ADR 0006](0006-content-foundation-storage-boundary.md) for Phase 3

## Context

The private content foundation has no application mutation interface. Draft editing requires safe structured content, caller-derived authority, atomic history and protection against concurrent or uncertain saves. The owner accepted the recommended contract with “looks good” on 2026-10-22.

## Decision

Use Tiptap behind an application-owned, versioned JSON adapter and explicit Save. The linked contract is authoritative for document grammar, bounds, request/result shapes, selections, pagination and error handling.

Expose only narrow authenticated draft create/save RPCs. Explicit trusted identity, active profile/membership, ownership or administrator authority, draft status and content checks apply inside the database functions. Keep direct table writes closed. Use integer edit versions, private request receipts and per-actor quotas; commit article changes, associations, revision, audit and successful receipt atomically. Derive actor/owner internally. No service-role client or new hosted service is introduced.

## Alternatives considered

Lexical would require a different adapter; the accepted package selects Tiptap. A textarea omits required rich formatting. Autosave needs a separate scheduling/history contract and is deferred. Broad table write grants or an elevated application client weaken the established boundary. Persistent browser backups and collaboration services are outside this slice.

## Consequences

SQL and TypeScript validation need shared adversarial fixtures and real database parity tests. Editor defaults must match the canonical grammar without discarding meaningful content. Retry and concurrent-session tests must prove atomicity and preserve newer edits. Package versions, peers, licenses and audit findings require checking before installation. Existing legacy bodies need a safe unsupported-content state; no destructive conversion is authorized.

Publishing, uploads, public routes, lifecycle/reassignment, retention/deletion policy, unresolved client labels and human/pre-launch reviews remain separate. Current application writes remain denied until the planned functions are implemented and verified.

## Validation

The owner accepted the written contract. The executable plan assigns security denials, byte boundaries, real-session races, adapter round trips and accessible recovery states to specific tasks. This record does not claim runtime validation of Phase 3; implementation evidence belongs with each task and the final integrated verification.
