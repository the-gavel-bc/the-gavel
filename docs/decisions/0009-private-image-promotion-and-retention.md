# 0009: Promote validated private images on the server

- Status: Accepted
- Date: 2026-11-03
- Related requirements: [Phase 4 editorial contract](../superpowers/specs/2026-11-01-editorial-workflow-design.md), [Task 3 plan](../superpowers/plans/2026-11-02-private-article-media.md)
- Supersedes / superseded by: None

## Context

Private article images must be decoded and re-encoded before Storage trusts them. Authors need to retry uncertain uploads, and retained revisions must prevent object deletion. The browser cannot hold a trusted Storage credential.

## Decision

The Next.js server uses a Supabase service-role key only for final writes of validated WebP bytes and object cleanup, as approved by the owner on 2026-11-02. A user-scoped reservation or removal RPC authorizes each request first; service-role finalization and cleanup independently check the claimed active actor, article, and object state. The key stays server-only.

Main-image attachment uses its own versioned, receipt-backed mutation so Phase 3 draft payloads and exact retries remain compatible. Current links and historical revision image references are relational foreign keys. A revision trigger captures the historical reference in the same transaction as the snapshot. Cleanup marks an unused asset unavailable before deleting its object and record.

A trusted upload claim moves a pending asset to `uploading` before the Storage write. Cleanup rejects that state. An uncertain upload keeps the same reservation for retry.

## Alternatives considered

- Browser direct Storage upload: untrusted bytes could reach the protected object path before server decoding and re-encoding.
- Extending the existing draft-save payload: mixed-version requests could change Phase 3 fingerprints and replay behavior.
- Searching revision JSON during cleanup: a free-form lookup would not enforce retention through a foreign key.

## Consequences

The server needs a secret in each deployment environment. Operations have reservation, upload, attachment, and cleanup steps, so uncertain outcomes must remain retryable. Historical image objects remain retained while their revisions exist. Rich body images and private preview are separate Task 4 work.

## Validation

pgTAP covers grants, Storage visibility, actor and ownership denials, finalization, attachment, and relational retention. Independent sessions test both attachment/removal lock orders. Desktop and mobile browser journeys upload a real PNG, reject corrupt input, attach, reopen, and unlink. See [Task 3 verification](../testing.md#phase-4-task-3-private-article-media-in-progress).
