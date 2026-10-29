# 0007: Use a constrained editor and atomic private draft mutations

- Status: Accepted; private validation, create/save, editor, selections and Task 10 recovery implemented
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

Publishing, uploads, public routes, lifecycle/reassignment, retention/deletion policy, unresolved client labels and human/pre-launch reviews remain separate. Direct application table writes remain denied; the narrow checked create/save functions are implemented.

On 2026-10-22 the owner explicitly deferred internationalized domains after review found a PostgreSQL/browser punycode-validation mismatch. The contract now excludes `xn--` host labels; ordinary domains and international text in content/URL paths remain supported. Revisit support through a new migration, matching TypeScript checks and shared standards-based fixtures before enabling these domains.

## Validation

The owner accepted the written contract. The executable plan assigns security denials, byte boundaries, real-session races, adapter round trips and accessible recovery states to specific tasks. Tasks 2–8 implement and test private input validation, atomic draft create/save, server queries/actions, My Articles and private create/edit with the constrained body editor; see [verification evidence](../testing.md#phase-3-task-2-draft-validation). Tasks 9/10 add association selectors and advanced reconciliation; Phase 3 whole-slice verification remains Task 11.

## Task 8 implementation evidence

Thirteen explicit MIT packages are pinned to Tiptap 3.32.0; required React peers include the pinned React 19 line. Actual React/Next/Node 22 runtime/build tests pass. Only the accepted schema is enabled; no paid/cloud/StarterKit capability is enabled. The adapter owns canonical/native translation, including verified default attributes and the native overhead budget, leaving stored body/RPC contracts unchanged.

The editor uses client-only dynamic loading and `immediatelyRender:false` per [official Next integration](https://tiptap.dev/docs/editor/getting-started/install/nextjs). Plain-text-only paste is an explicit conservative policy: unsupported rich formats are rejected rather than silently shortened. Task 8 initially gated unavailable selections; Task 9 replaced that gate with deliberate replacement/removal. Validation and real-browser evidence are recorded in [testing](../testing.md#phase-3-task-8-constrained-body-editor).

## Task 10 implementation evidence

Task 10 retains explicit Save and existing mutation authority while separating current/acknowledged input from immutable submitted commands. Newer edits survive delayed responses and exact retries. Conflict recovery compares authorized latest state before an explicit load, retains last-valid local input for manual re-entry and never synthesizes force-overwrite commands. A created resource stays mounted if immediate navigation would lose newer edits.

A callback-only dashboard context guards supported Next Link navigation and sign-out before transport; full-document unload warnings remain best-effort and same-document browser history is not guaranteed intercepted. No draft content is stored in this context or browser persistence. The [Task 10 evidence](../testing.md#phase-3-task-10-save-and-conflict-recovery) distinguishes local/agent checks from outstanding human and hosted assurance.
