# Current work

- Phase: 4. Tasks 1–9 are implemented in the stack; Task 10 contributor-profile management is in progress.
- Branch: `feat/admin-contributor-profiles`, stacked on [Task 9 integration PR #38](https://github.com/dylandrozario/the-gavel/pull/38). PR #37 merged into the Task 8 branch after PR #36 had merged to main; PR #38 brings Task 9 into main.
- Approved onboarding decision: an administrator approves an existing eligible signed-in BC Google identity; approval creates both membership and linked public profile. The administrator supplies public display name; the database generates its slug.
- Implemented here: checked approval, role change, deactivation, last-admin guard, exact retry receipts, audit, bounded directory/activity reads, and dashboard controls. Direct authenticated membership mutation grants are closed.
- Verified locally: 1,366 pgTAP assertions; 18 focused unit/component tests; two concurrency cases; four desktop/mobile browser cases; TypeScript, targeted lint/format, schema lint, generated types and production build. See [Task 9 plan](docs/superpowers/plans/2026-11-06-admin-memberships.md).
- Pending: Task 10 final review and PR, clean migration CI, human review, and stack merge. Public article reads and remaining administrator domains are future tasks.
