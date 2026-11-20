# 0011: Admit public search inside the database

- Status: Accepted for Phase 5 Task 17; hosted verification remains a launch gate
- Date: 2026-11-10
- Related requirements: [reader contract](../superpowers/plans/2026-11-09-phase-five-reader-contract.md), [Task 17](../superpowers/plans/2026-11-10-bounded-public-search.md)
- Supersedes: none

## Context

Search is callable directly through Supabase, so a Next.js-only limit would be bypassable. The owner approved a shared database-wide limit without a new service. Admitted work must remain charged after rollback, cancellation or response loss.

## Decision

Use a private, cache-1 PostgreSQL sequence encoding the server minute and admitted count in 128-value buckets. Reserve 80 full searches and 40 typeahead attempts per minute. Each lane uses its own private sequence and transaction advisory lock. A busy lane returns a one-second retry without waiting. Compute time after acquiring the lock. During migration, carry over tickets already spent in the current window. Sequence increments survive ordinary transaction rollback. Never rewind a counter ahead of the server clock; fail closed until time catches up. Invalid inputs do not acquire admission.

Expose only a direct POST RPC with a two-second function timeout. [PostgREST hoists function settings](https://docs.postgrest.org/en/v12/references/transactions.html#function-settings) before executing the SQL statement. Check its trusted request path/method so nested transports cannot skip that boundary. Cancellation raises a fixed [PGRST error](https://docs.postgrest.org/en/v12/references/errors.html#add-http-headers-with-raise) with HTTP 503 and no-store, aborting the whole transaction. Returning normally after cancellation could allow later bulk calls to continue after the deadline fired. The checked anonymous server adapter also aborts transport after three seconds.

## Alternatives considered

- A transactional counter refunds cancelled/rolled-back attempts.
- A server-only limiter cannot cover direct RPC access.
- A separate limiter service adds infrastructure beyond the approved first version.
- Session advisory locks risk surviving a cancelled request on a pooled connection.
- Per-role global timeouts or gateway hooks affect unrelated operations unnecessarily.

## Consequences

Each lane has a database-wide limit. One source can exhaust a lane for all its callers, but typeahead cannot spend full search tickets. Fixed windows allow bursts across a boundary. Each lane admits one transaction at a time. Sequence crash gaps/state uncertainty are operational concerns; this is rate-control state, not an audit ledger. Pool acquisition and general request floods need hosted capacity monitoring or future edge controls. No per-IP or DDoS protection is claimed.

Search results and all failure states are uncached. The response contains existing public cards, never body snippets. Hosted release requires the same timeout, cancellation and transport proof as local verification. A rollback can restore the prior helper and typeahead function definitions in one migration. The additional sequence can remain private. Restore the shared budget in a new minute so recently admitted typeahead work cannot be charged twice or omitted.

## Validation

[Task 17 verification](../superpowers/plans/2026-11-10-bounded-public-search.md#verification-record) records SQL, direct HTTP, burst, rollback and cancellation evidence separately from hosted/human gates.
