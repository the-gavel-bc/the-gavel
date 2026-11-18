# Code reviews

Output of the multi-agent review described in `.claude/skills/full-codebase-review/SKILL.md`. Reviews are read-only; code changes happen only after the findings are approved.

Files written here by a review run:

- `raw/<agent>.md`: each reviewer's unedited report (audit trail).
- `REVIEW-REPORT.md`: consolidated, verified findings.
- `IMPLEMENTATION-PLAN.md`: prioritized batches (P0 to P4).
- `FINAL-IMPLEMENTATION-REPORT.md`: what was approved, changed, and verified.

Run it from the repository root with `/full-codebase-review`. Reviewer and verifier agents live in `.claude/agents/`. Earlier hand-written reviews are in [../reviews](../reviews).

[REPORT-FORMAT.md](REPORT-FORMAT.md) is the shared contract every reviewer follows: scope, evidence standard, severity scale, finding template, and output limits. Change review behavior there, not in each agent.
