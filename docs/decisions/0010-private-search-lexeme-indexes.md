# 0010: Use private native lexeme indexes with live labels

- Status: Accepted for Phase 5 Task 16
- Date: 2026-11-10
- Related requirements: [reader contract](../superpowers/plans/2026-11-09-phase-five-reader-contract.md#pagination-and-search), [Task 16 proof](../superpowers/plans/2026-11-10-search-index-foundation.md)
- Supersedes / superseded by: None

## Context

The accepted canonical body can occupy 1 MiB. Its normalized lexemes/positions can exceed PostgreSQL's [single-vector limit](https://www.postgresql.org/docs/17/textsearch-limitations.html). Search must not truncate body prefixes or make valid editorial writes fail. Joined public labels must reflect current names and associations without a refresh race.

## Decision

Use distinct normalized word arrays with native [GIN array containment](https://www.postgresql.org/docs/17/gin.html#GIN-BUILTIN-OPCLASSES) expression indexes. The explicit built-in simple configuration retains names and stop words without stemming. A native vector-to-array fast path handles ordinary text; oversized vectors use immutable native parser/dictionary primitives. Installation captures the configured parser/token IDs, avoiding STABLE catalog reads inside indexed expressions. Lexemes of 2 KiB or more retain PostgreSQL's native exclusion; private candidate words are bounded below that limit.

Index article title/excerpt/meta-description and allowlisted canonical text/captions only for published rows. Index active public names on their own records and read current association joins. The private candidate reader intersects word hits across sources, deduplicates IDs, rechecks live public eligibility and returns newest-first bounded IDs. No public search grant or endpoint is added at this stage.

## Alternatives considered

- One ordinary tsvector: can reject valid high-vocabulary bodies at the size limit.
- Prefix truncation: loses legitimate tail matches.
- Denormalized joined-name document: requires refresh/race/retry machinery on every related change.
- External search provider: unnecessary service and synchronization work for the approved MVP.

## Consequences

There is no stored-column backfill or source-data rewrite. Native index maintenance shares source transactions. Initial search has no phrase positions or relevance ranking. Dictionary, parser, canonical validation or extraction changes require a versioned migration and index rebuild; replacing helper semantics alone does not refresh existing keys. Standard index builds block writes and need a maintenance window on large catalogs. Query postings work depends on corpus size; Task 17 must still prove effective public timeout, quota and cancellation behavior.

## Validation

The [task plan](../superpowers/plans/2026-11-10-search-index-foundation.md#verification-record) records source-preservation hashes, exact-size body/tail proof, live metadata and checked mutation regressions, lock-timeout rollback/retry, clean rebuild, native schema lint and unforced representative query plans. Human review and hosted deployment evidence remain separate gates.
