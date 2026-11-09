# Development workflow

Status: Approved working process.

## Task workflow

1. Read relevant requirements and identify observable acceptance criteria.
2. Inspect the current branch, worktree, documentation, and nearby implementation.
3. Clarify decisions that materially change behavior, architecture, security, or contracts.
4. For significant work, write a focused implementation plan with validation and rollback considerations.
5. Implement the smallest complete vertical slice using tests appropriate to its risk.
6. Update affected requirements, contracts, schema, security notes, and operational documentation.
7. Run relevant checks and inspect the resulting user experience.
8. Summarize changes, evidence, limitations, and remaining questions.

## Placing new code

Use the [repository structure](architecture.md#repository-structure) as the ownership map. Start with the feature's existing implementation and tests: presentation and interaction state belong to its frontend domain, server queries/actions to its backend domain, and contracts genuinely consumed on both sides to shared. Keep framework entry points in `src/app` and database operations in `supabase`; a new folder does not require a new service or wrapper.

An interactive component calls an explicit Server Action for mutations; it cannot import ordinary backend runtime code. Use explicit `import type` for backend result types. Keep ordinary backend modules guarded with `server-only`, and run `pnpm lint` to catch ownership violations in both aliases and relative imports. Follow the [comment guidance](coding-style.md#comments-and-intent) when retries, concurrency or validation need explanation. Add focused tests beside their owner and use the existing integration suites only when the affected boundary requires them.

## Foundation verification

Use the commands in [testing.md](testing.md) with Node.js 22 and the pinned pnpm version. Run local Supabase before database and browser checks. The CI workflow mirrors formatting, lint, strict types, tests, database reset/pgTAP/lint/type drift, build, browser tests, and security scans. A known finding is not automatically an accepted exception. Any exception requires explicit maintainer approval and a documented scope and removal condition. The former CI-only exception is retired in [ADR 0005](decisions/0005-temporary-ci-audit-exception.md); current production/full audits are unfiltered and high/critical findings remain blocking.

## Security-sensitive work

Authentication, authorization, RLS, uploads, rich content, caching, redirects, secrets, and migrations require negative tests and review. UI permission checks never replace server and database enforcement. Follow the [Phase 1 maintainer checklist](reviews/phase-1-foundation.md#maintainer-review-steps) to record the foundation review; automated or agent review does not substitute for the second-maintainer requirement in [Git and GitHub](git-github.md#pull-requests).

## Definition of done

- Approved acceptance criteria are met.
- Relevant automated and manual verification succeeds.
- Forbidden permission paths are tested.
- Accessibility and responsive states are considered.
- Database changes include migrations and compatibility reasoning.
- Observability and failure behavior are adequate for the change.
- Documentation matches actual behavior and labels future behavior honestly.
- No secrets, private production data, or unrelated changes are included.
