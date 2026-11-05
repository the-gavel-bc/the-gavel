# Current work

- Phase: 4, Task 6 owner article lifecycle. Task 5 / PR #32 is open.
- Branch: `feat/owner-article-lifecycle`, stacked on `feat/published-article-editing` while #32 is open.
- Implemented here: checked publish/archive RPCs, atomic revision/audit/receipt transitions, dashboard confirmation and recovery controls, and legacy published archive access.
- Verified locally: 1,277 pgTAP assertions; 529 unit cases; 214 draft parity cases; 31 concurrency cases; six desktop/mobile lifecycle browser cases; TypeScript, lint, format, schema lint, generated types, and production build via Playwright.
- PR: [#33](https://github.com/dylandrozario/the-gavel/pull/33), open against `feat/published-article-editing`; retarget to `main` after #32 merges.
- Pending: hosted CI (owner monitors) and human review. Public article reads, restore, administrator management, and provider setup remain future tasks.
