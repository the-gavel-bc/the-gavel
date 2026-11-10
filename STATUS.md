# Current work

- Phase: 5, Task 9 public homepage query on `feat/public-homepage-query`, based on Task 8 PR #57. PRs #56/#57 are still prerequisites; Task 9 targets main.
- [Task 9 plan](docs/superpowers/plans/2026-11-09-public-homepage-query.md) records shared admin/public slot resolution, bounded public card batching, Latest/section grouping and verification.
- Approved homepage: one lead, four featured and four Read This with saved-pick reservation and cross-slot deduplication. Latest has three newest excluding lead; section rows have four and can repeat curated articles.
- Public shell/primitives remain in preceding tasks. No homepage presentation changes in Task 9; Task 10 wires these results into the reader UI and footer.
- Verified: 1,715 clean-stack database assertions, 65 focused curation SQL assertions, 14 focused unit tests, independent-session archive/restore, schema/type/lint/format and production build.
- Reader branding/screenshots and human review remain pending. Owner monitors hosted CI. Approved media cache/backfill and other Phase 5 decisions remain in the reader contract.
