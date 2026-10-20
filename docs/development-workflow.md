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

## Foundation verification

Use the commands in [testing.md](testing.md) with Node.js 22 and the pinned pnpm version. Run local Supabase before database and browser checks. The CI workflow mirrors formatting, lint, strict types, tests, database reset/pgTAP/lint/type drift, build, browser tests, and security scans. A known finding is not automatically an accepted exception. Any exception requires explicit maintainer approval and a documented scope and removal condition. The current CI-only development dependency exception is approved in [ADR 0005](decisions/0005-temporary-ci-audit-exception.md); all other high/critical findings remain blocking.

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
