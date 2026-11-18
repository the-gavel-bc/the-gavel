---
name: full-codebase-review
description: Runs a parallel, read-only review of the whole repository with eight specialist agents, verifies and consolidates their findings, and prepares an approval-gated remediation plan. Use only when the user asks for a full review or audit.
---

# Full Codebase Review

Arguments (all optional, combinable):

- A path or area (for example `src/backend/media`) narrows every reviewer's focus.
- `quick` runs only security, business-logic, architecture, and testing reviewers (the highest-yield four) and skips the verifier for Low findings.
- `diff` reviews only what changed against the default branch (`git diff main...HEAD --stat`, then the changed files and their direct callers); use it for pull requests. A full run is for milestones.

With no arguments, review the whole repository with all eight reviewers.

## Cost controls

- Agents run on cheaper models where depth matters less (`haiku` for code-quality and devops, `sonnet` elsewhere). Do not override upward unless a reviewer's output is clearly too shallow.
- Do the shared, deterministic work once, here, not eight times: file inventory with line counts, `rg` inventories (route handlers, server actions, `security definer` functions, tables and policies, `'use client'` files), and the project checks (typecheck, lint, unit tests, `pnpm db:types:check` when available) with their results. Put it in `docs/code-reviews/raw/_overview.md` and tell every reviewer to read it instead of rediscovering.
- Verify only Critical and High findings plus a sample of Medium; do not spend verifier effort on Low or Informational.

You are the lead orchestrator. Discovery and implementation are separate: no application code changes until the user approves findings.

## Phase 1 — Discovery
Read AGENTS.md, README.md, STATUS.md, the docs index, `docs/decisions/` titles, and `docs/reviews/` so you know what is already decided or documented. Record `git status` and the current branch (preserve uncommitted work). Run the project checks once (see Cost controls) and write the shared overview to `docs/code-reviews/raw/_overview.md`: stack, entry points, inventories, check results, known decisions and deferrals. Modify nothing apart from files under `docs/code-reviews/`.

## Phase 2 — Parallel review
Launch these subagents in ONE message so they run in parallel, each with the overview: security-reviewer, performance-reviewer, ui-ux-reviewer, code-quality-reviewer, testing-reviewer, architecture-reviewer, business-logic-reviewer, devops-reviewer. Each follows `docs/code-reviews/REPORT-FORMAT.md` (scope, evidence standard, severity, template, limits), reviews the repository from its specialty, and makes no edits. Pass each the path to `raw/_overview.md`, the optional focus area, and this instruction: return the report as your final message, at most 20 findings. Wait for all of them. If an agent fails, times out, or returns a truncated or off-format report, say so and re-run that one agent with a narrower scope; never silently proceed without it. Save each raw report to `docs/code-reviews/raw/<agent>.md` as the audit trail.

## Phase 3 — Consolidation and verification
Merge duplicates, resolve conflicting recommendations, check that cited files and lines exist, separate confirmed issues from potential risks, and note dependencies between fixes. Then send the consolidated Critical and High findings (and a sample of Medium) to `implementation-reviewer` for an independent verdict and severity check, batching them in one call. Drop findings that fail the evidence standard. Collect each reviewer's `Handoffs` and `Decision challenges` and route them to the right specialist or to the user. Do not accept any agent's conclusion blindly; ask the relevant specialist for more read-only investigation where unclear. Report which areas nobody examined (from the `Not examined` lists).

## Phase 4 — Report
Write `docs/code-reviews/REVIEW-REPORT.md` (executive summary; every finding with ID, category, severity, confidence, location, description, evidence, impact, fix, complexity, regression risk, approval_status: Pending, implementation_status: Not Started) and `docs/code-reviews/IMPLEMENTATION-PLAN.md` (P0 critical, P1 high, P2 medium, P3 low, P4 informational; implementation batches with dependencies, overlapping files, order, tests, risks). Severity reflects impact, not volume.

## Phase 5 — Human approval (STOP)
Summarize the report in chat (counts by severity, the P0 and P1 items, anything needing a product decision) and ask which findings, priority groups, or batches to approve. Record rejected and deferred ones. Implement nothing before an explicit yes. Respect AGENTS.md: changes to authentication/authorization, public URLs, content lifecycle, destructive migrations, new external services, or MVP scope need discussion first.

## Phase 6 — Implementation (after approval only)
Plan the approved findings, list affected files, and group non-overlapping work. Use implementation subagents only for independent tasks, in isolated worktrees when changes could conflict; never two writers on the same files. Keep changes focused, follow docs/coding-style.md, update affected docs, no unrelated refactoring, no API or schema changes beyond the approved scope.

## Phase 7 — Verification
Run the project's documented checks (docs/testing.md and package scripts): unit, integration, end-to-end where available, lint, typecheck, build, and relevant security checks. Review the diff for unintended changes and have `implementation-reviewer` confirm each approved finding is addressed. Report failures; never claim a check passed unless it ran.

## Phase 8 — Final report
Write `docs/code-reviews/FINAL-IMPLEMENTATION-REPORT.md`: approved, rejected and deferred findings, files changed, tests run and results, remaining issues, limitations, new risks. Do not commit, push, or deploy without explicit approval.
