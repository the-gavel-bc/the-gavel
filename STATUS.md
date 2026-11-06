# Current work

- Phase: 4. Tasks 1–8 are implemented in the stack; Task 9 membership management is built and awaiting PR.
- Branch: `feat/admin-memberships`, stacked on [Task 8 PR #36](https://github.com/dylandrozario/the-gavel/pull/36), whose foundation check passed on 2026-11-05.
- Approved onboarding decision: an administrator approves an existing eligible signed-in BC Google identity; approval creates both membership and linked public profile. The administrator supplies public display name; the database generates its slug.
- Implemented here: checked approval, role change, deactivation, last-admin guard, exact retry receipts, audit, bounded directory/activity reads, and dashboard controls. Direct authenticated membership mutation grants are closed.
- Verified locally: 1,366 pgTAP assertions; 18 focused unit/component tests; two concurrency cases; four desktop/mobile browser cases; TypeScript, targeted lint/format, schema lint, generated types and production build. See [Task 9 plan](docs/superpowers/plans/2026-11-06-admin-memberships.md).
- Pending: final diff review, commits and Task 9 PR; Task 8 human review and hosted CI remain owner-monitored. Public article reads and remaining administrator domains are future tasks.
