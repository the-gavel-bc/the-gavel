# Current work

- Phase: 4. Tasks 1–13 are on main. Task 14 is ready for review in [PR #45](https://github.com/dylandrozario/the-gavel/pull/45).
- Branch: `feat/archive-permanent-deletion`, based on main after Task 13. Task 15 is open in [draft PR #46](https://github.com/dylandrozario/the-gavel/pull/46); PR #45 must merge before final integration.
- Approved policy: administrators may delete immediately after archiving; revisions are deleted with the article; audit events retain article and actor IDs; Auth accounts remain. Image keys stay in a permanent ledger and are swept repeatedly to handle late uploads.
- Implemented locally: versioned deletion, retained IDs/slugs and audits, permanent media registry and prefix scans, bounded cleanup worker, fail-closed health gate, production cron and administrator retry/status. No real article was deleted. See the [Task 15 plan](docs/superpowers/plans/2026-11-07-archived-article-deletion.md).
- Local checks passed; clean-install CI, hosted cron verification and human security/accessibility review remain pending. Production cleanup needs a configured service key, cron secret, monitoring and an initial healthy check. Public rendering remains Phase 5.
