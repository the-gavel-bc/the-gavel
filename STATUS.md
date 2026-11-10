# Current work

- Phase: 5, Task 16 search foundation on `feat/search-index-foundation`, based on Task 15 PR #64. All reader PRs through #64 are merged; this task targets main.
- [Task 16 plan](docs/superpowers/plans/2026-11-10-search-index-foundation.md) and [ADR 0010](docs/decisions/0010-private-search-lexeme-indexes.md) record private extraction, native word-array indexes, live labels and rollout/rebuild rules.
- Implemented additive private helpers, five GIN indexes and a private bounded candidate reader. No public endpoint/grant or source-column change. Maximum-size canonical bodies retain tail matches; metadata is not denormalized.
- Populated upgrade preserved 35 source-table hashes; lock rollback/retry and clean rebuild passed. Full SQL: 1,818 assertions; final fallback correction: 77 targeted assertions plus clean schema lint. All 747 unit tests, types/lint/format/build and public generated-type comparison passed. Representative 10k-article plans passed; one review found no issues.
- Migrations verified only on a disposable DB; the existing working database was left untouched. Hosted CI/performance and human review remain separate. Owner monitors CI.
- Next: Task 17 bounded public search query, shared quota and cancellation proof; Task 18 supplies UI.
