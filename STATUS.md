# Current work

- Phase: 5, Task 15 public author pages on `feat/public-author-pages`, based on Task 14 PR #63. Targets main; #63 remains a prerequisite while open. Task 13 PR #62 is merged.
- [Task 15 plan](docs/superpowers/plans/2026-11-10-public-author-pages.md) records existing-policy projection, DTO, biography composition and verification.
- Implemented `/authors/[slug]`: active public profiles/guests/empty archives, plain biographies, deduplicated owned-or-credited published cards, bounded native pagination, real inactive/missing-profile 404 and noindex failures. Auth/membership linkage stays outside the projection; inactive membership alone retains journalism.
- All 747 unit tests, 42 relevant SQL assertions, types/lint/format and production build passed. Eight desktop/mobile author/tag cases passed, including 320px/no-JavaScript reading and signed-in parity. One review found no issues; fixtures removed.
- No schema/grant/auth/lifecycle change. Profile images remain unresolved; human visual/security/accessibility review remains pending. Owner monitors hosted CI.
- Next: Task 16 searchable published-text extraction and indexes.
