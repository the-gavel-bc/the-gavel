# Current work

- Phase: 5, public reader experience. The accepted plan is [Phase 5 public reader](docs/superpowers/plans/2026-11-09-phase-five-public-reader.md).
- Next planned task: Task 21, sitemap and robots. Tasks 22 and 23 cover screenshot/accessibility reconciliation and integrated verification.
- Recent task evidence: Tasks 16–17 and 19–20 have implementation branches and task records. Task 18 search/recovery is implemented, with a documented release blocker: matched resource 404s return blank initial HTML without JavaScript on Next.js 16.4.2. Existing route-level `not-found.tsx` boundaries do not fix it.
- Local Task 18 reproduction: desktop and mobile browser checks reproduced the blank initial HTML against an isolated Supabase project. The scratch project is stopped. This was verification only; no code or branch changes remain from that check.
- GitHub status: the last recorded Phase 5 PRs are #65–#69. A live PR/check query failed because `api.github.com` was unreachable. Confirm current PR merges and checks before starting a task branch.
- Workspace: primary checkout is stale `main` at `64922a2`, behind its `origin/main` tracking ref. Preserve the untracked `screenshots/` directory. Phase 5 branches and worktrees exist under `/private/tmp`; inspect their status before cleanup or reuse.
- Release gate: resolve the Task 18 no-JavaScript resource 404 blocker, then complete Task 23 verification and the remaining human/operational gates in the Phase 5 plan.
