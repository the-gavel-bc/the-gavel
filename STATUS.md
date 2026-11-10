# Current work

- Phase: 5, Task 12 public article page on `feat/public-article-page`, based on Task 11 PR #60. Preceding reader PRs through #60 are merged; this task targets main.
- [Task 12 plan](docs/superpowers/plans/2026-11-10-public-article-page.md) records decisions, checks, startup/test-fixture issues and proof limits.
- Implemented server-rendered article header, explicit credits, authorized media, safe body, taxonomy, public owner biography and bounded related/recent stories. Anonymous and owners receive the same projection; private/archived/missing slugs return real 404.
- Build/types/lint/format and focused tests pass. Full unit run: 711 passed, one existing import-boundary timeout; unchanged module passed its targeted default-timeout rerun. Four desktop/mobile browser cases and disposable responsive/no-JavaScript media/edit/archive/restore proof passed.
- No schema/auth/lifecycle change. Human visual/security/screen-reader review remains pending. Owner monitors hosted CI.
- Next: Task 13 section, category and letters archives.
