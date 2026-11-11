# Current work

- Phase: 5, public reader experience. The accepted plan is [Phase 5 public reader](docs/superpowers/plans/2026-11-09-phase-five-public-reader.md).
- Active task: Task 21, sitemap and robots, on branch `feat/public-sitemap-robots` from main `9269c86`. Implemented, reviewed once, and verified locally; PR open against main. See the [Task 21 plan](docs/superpowers/plans/2026-11-11-public-sitemap-robots.md).
- Approved decisions (2026-11-11): the sitemap lists only non-empty archives; robots disallows `/search`; article lastmod uses `published_at`; one robots file for every environment, with previews relying on Vercel protection.
- Next planned tasks: Task 22 (screenshot/accessibility reconciliation; the owner screenshots are in the untracked `screenshots/` directory, so preserve it) and Task 23 (integrated verification).
- GitHub: PRs #65–#69 are merged and main CI is green at `9269c86`. Earlier red runs were the gitleaks false positive fixed in `5831aea`. Cancelled runs come from `cancel-in-progress` concurrency.
- Workspace: the primary checkout is on the Task 21 branch with dependencies installed (Node 22). The disposable Supabase project `gavel-task21` (`/private/tmp/gavel-task21-db`, ports 5842x) was used for verification; the primary local project was not reset.
- Release gate: resolve the Task 18 no-JavaScript resource 404 blocker, then complete Task 23 verification and the remaining human/operational gates in the Phase 5 plan.
