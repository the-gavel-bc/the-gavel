# Current work

- Phase: 4. Tasks 1–12 are on main; Task 13 homepage curation is open in [PR #44](https://github.com/dylandrozario/the-gavel/pull/44).
- Branch: `feat/homepage-curation`, based directly on main after [Task 12 PR #43](https://github.com/dylandrozario/the-gavel/pull/43) merged with a passing foundation check.
- Approved rules: one lead, up to four Featured News and four Read This stories; published articles only, no repeats, newest eligible fallback with curated stories reserved first.
- Implemented here: checked versioned curation, safe fallback preview, archive race protection, exact retry and administrator selection controls.
- Verified locally: 1,478 pgTAP assertions, 600 unit tests, 43 concurrency cases, three desktop/mobile browser cases, TypeScript, targeted lint/format, schema lint, generated types and production build. See [Task 13 plan](docs/superpowers/plans/2026-11-07-homepage-curation.md).
- Pending: PR review, clean migration CI and merge. Public homepage rendering remains Phase 5 work.
