# Current work

- Phase: 4, Task 7 administrator article management and restore. Tasks 5–6 / PRs #32–33 are open.
- Branch: `feat/admin-article-management`, stacked on `feat/owner-article-lifecycle` while #33 is open.
- Implemented here: checked administrator restore; bounded all-owner article list/detail with filters, pagination and safe summaries; dashboard archive restore control.
- Verified locally: 1,309 pgTAP assertions; 538 full unit cases plus focused not-found page proof; 214 draft parity cases; eight editor parity cases; 32 concurrency cases; six desktop/mobile admin browser cases; TypeScript, lint, format, schema lint, generated types, and production build via Playwright.
- PR: pending creation against `feat/owner-article-lifecycle`.
- Pending: hosted CI (owner monitors) and human review. Public article reads, other admin domains, archive repair, and provider setup remain future tasks.
