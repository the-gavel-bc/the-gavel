# Prompt: plan and build the review fixes

Paste everything inside the fenced block into a new Claude Code session opened in the repository (or in the worktree that holds the stack). It plans first, stops for approval, then builds in small batches.

````text
You are fixing the findings from the code reviews of The Gavel (Next.js 16, Supabase, Vercel). Plan first, get my approval, then build in small batches. Be concise and evidence-based; report only checks you actually ran.

## 1. Read first (do not skip)
1. AGENTS.md (project rules: documentation duties, scope, "changes requiring discussion first": authentication or authorization model, public URL changes, content lifecycle changes, destructive migrations, new external services, MVP scope additions).
2. docs/code-reviews/COMBINED-REVIEW-REPORT.md (findings C-01 to C-39 with status Fix now, Cheap, Plan, Deferred, and the coverage table of reviewed and remaining areas).
3. docs/code-reviews/COMBINED-FIX-PLAN.md (batches 1 to 7 and the five decisions I owe you).
4. docs/code-reviews/DEFERRED.md (everything not planned, with reasons; also the "Decided not to change" table: do not re-raise those).
5. docs/code-reviews/AREA-1-AUTH-REPORT.md and AREA-2-STAFF-REPORT.md (area 2 has findings S2-01 to S2-12 and test gaps that are not yet implemented).
6. docs/git-github.md, docs/testing.md, docs/coding-style.md, docs/development-workflow.md, and the ADRs 0012 and 0013 and docs/superpowers/plans/2026-11-19-publication-date-field.md.
7. git log and `gh pr list --state open`. Work out which branch is the top of the open stack and which PRs are merged. State what you found before planning.

## 2. Phase A: plan (no code changes)
Write docs/superpowers/plans/<today>-review-fixes.md containing, for each batch below:
- the findings it covers (IDs), the exact files and migrations it touches, and which of them are security-definer functions or policies;
- acceptance criteria and the tests that must fail without the fix;
- design-level risks: race safety, retry and idempotency behavior, conflict recovery, rollout order (database before app), migration locking and backfills, backward compatibility of the draft input contract;
- the verification commands you will run;
- anything that needs my decision (list them; propose a default).
Then verify any claim marked "needs a runtime check" in the reports before relying on it (for example: lifecycle controls stay locked after a status-keeping action; Save tap on a phone viewport; tag and profile read exposure through the REST API). Mark each verified, refuted, or still unproven.
STOP after the plan and ask me to approve it. Ask all product questions in one batch. Do not write code before I approve.

## 3. Batches (build in this order, one branch and one PR each)
1. Lifecycle bugs (one migration): clear review_requested_at on publish and restore plus a data fix and a CHECK; the owner's list actions use the real published_by; navigate to the review queue after a return; remove the publication-date backfill from the unmerged migration; derive the date from published_at when it is cleared on a published article; save replay paths use authority mode replay; ADR 0013 wording. Decision pending: re-check the date on restore.
2. Bylines in Eastern time: article header, homepage hero, preview cards, and any other reader date formatter; tests with evening-UTC cases.
3. Database hygiene (one migration): row-level security on the private tables, revoke default privileges for future objects, a catalog-invariant pgTAP file (RLS on every public table, fixed search_path on every security definer function, anon execute allowlist), drop confirmed-dead functions, a CI check that migration versions only increase; regenerate types.
4. CI and dependencies: run the audit steps regardless of the browser step, bump next and eslint-config-next to the latest patched 16.4.x, Playwright webServer timeout and failure artifacts, one dbContainer helper, remove the stale push trigger, pin the runner, engines.node, caches.
5. Editor quick fixes: keep a typed return note on backdrop click, empty-row Add contributor and focus handling, retry condition, dead code, danger variant for image removal, wording, design-system doc. Decision pending: enforce the five-contributor cap on the server.
6. Tests: the pgTAP and Vitest gaps listed in COMBINED-REVIEW-REPORT C-37, C-38, C-39 and area 2's test gaps (editor in every membership and invitation function, non-administrator denials, last-administrator cases, audit assertions).
7. Area 2 fixes in AREA-2-STAFF-REPORT.md plan order (audit role detail, single source for roles, distinct last-administrator code, small database fixes), after batches 1 to 6.
Then, only if I ask: the Plan items (tags and profiles read policies, separate search budgets, media ETag, layout caching, slug lock, retention, health endpoint), each starting with a short design note.

## 4. Phase B: build (after approval)
- Branch from the top of the open stack unless I say otherwise; open each PR against main and say in the body that it is stacked. Do not merge into other feature branches.
- Small commits (target at most 300 changed lines), Conventional Commits, include the schema, tests and docs with the behavior. Never rewrite pushed history; never commit secrets, local keys, screenshots or .claude/launch.json.
- For every database change: write the migration, apply it to a disposable local database, run the touched pgTAP files and the whole suite on a database cleared of leftover application data (some old files fail on a used database: 027, 056, 057 and 058 are known to depend on leftover data), run the concurrency suite (scripts/draft-concurrency), regenerate and format the generated types, and apply the migration file once more inside a rolled-back transaction to prove it runs.
- For every change: pnpm typecheck, pnpm lint, pnpm format:check, pnpm test, and pnpm build before opening the PR. Use the project's Node version (nvm use) because pnpm 11 needs Node 22. Do not run prettier on supabase/.
- Test denials for roles and ownership (author, editor, administrator, other author, inactive, pending) for anything touching access. Update affected docs in the same PR. Keep requirements and schemas authoritative in one place and link to them.
- Do not claim a check passed unless it ran. If a check cannot run, say why. After each PR report: what changed, how it was verified (commands and results), what remains.
- After each batch update docs/code-reviews/DEFERRED.md (move done items out, add anything newly deferred with its reason) and the status column in COMBINED-REVIEW-REPORT.md.
- Merging: do not merge any PR unless I tell you to. CI is currently red on the stack because of about 13 stale browser specs; report CI status honestly and do not hide it.
- Watch usage: each reviewed area cost about 1 percent of a weekly limit and 12 to 25 percent of a 5-hour window on the Pro plan. Prefer a cheaper model for mechanical edits and formatting; keep the stronger model for design and review. Check usage before starting each batch and say when you are near a limit.

## 5. Rules for decisions
- Anything in "changes requiring discussion first" in AGENTS.md needs my explicit approval before code, even if the plan lists it.
- If a finding turns out to be wrong, say so with evidence and record it under "Decided not to change" in DEFERRED.md instead of forcing a fix.
- If you discover a new problem, add it to DEFERRED.md or the report with severity and evidence; do not widen the batch without asking.

Start with section 1, then Phase A. Do not write code until I approve the plan.
````
