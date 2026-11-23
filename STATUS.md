# Current work

- Phase: Consolidated Batch 9 follow-ups on `fix/batch-9-review-follow-ups`, based on `main` at `258dac4`. PRs #143 through #147 merged earlier.
- Scope: The six remaining slices 9b, 9c, 9d, 9e, 9h and 9i, plus the orphan-credit cleanup from 9a, share one PR. D-03, D-04, G-13 and Batch 10 stay deferred.
- Plan and contract: [Combined fix plan](docs/code-reviews/COMBINED-FIX-PLAN.md), [ADR 0014](docs/decisions/0014-review-follow-up-decisions.md), and [deployment notes](docs/deployment.md).
- Upgrade evidence: a rolled-back Letters migration retained the existing section ID and both legacy URLs. An older create receipt backfilled guest provenance. A reuse receipt did not.
- Independent review: resolved a potential taxonomy lock inversion, provenance loss on account erasure, and disclosure of never-public tags through redirects. Archive browser verification also led to separating live route checks from cached navigation.
- Local verification: 1,313 unit and component tests, 2,749 pgTAP assertions, ten focused race tests, PostgreSQL lint, and generated database type parity pass. The browser suite exercises the production build on desktop and mobile.
- Rollout: maintainer review and hosted checks precede release. Use the [erasure runbook](docs/runbooks/auth-account-erasure.md) before executing any approved hard account deletion.
