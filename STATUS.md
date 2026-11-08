# Current work

- Phase: 4. Tasks 1–14 are on main, including [PR #45](https://github.com/dylandrozario/the-gavel/pull/45).
- Branch: `feat/archive-permanent-deletion`, updated with main through Task 14. Task 15 is open in [draft PR #46](https://github.com/dylandrozario/the-gavel/pull/46). Merge conflicts with Task 14 are resolved. Integration checks passed: types, generated database types, fixture formatting, 23 focused tests, and six browser cases (two shared-state mobile writes skipped).
- Approved policy: administrators may delete immediately after archiving; revisions are deleted with the article; audit events retain article and actor IDs; Auth accounts remain. Image keys stay in a permanent ledger and are swept repeatedly to handle late uploads.
- Implemented locally: versioned deletion, retained IDs/slugs and audits, permanent media registry and prefix scans, bounded cleanup worker, fail-closed health gate, production cron and administrator retry/status. No real article was deleted. See the [Task 15 plan](docs/superpowers/plans/2026-11-07-archived-article-deletion.md).
- Local checks passed; clean-install CI, hosted cron verification and human security/accessibility review remain pending. Production cleanup needs a configured service key, cron secret, monitoring and an initial healthy check. Public rendering remains Phase 5.
