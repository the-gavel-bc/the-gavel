# Git and GitHub workflow

Status: Draft — repository-specific conventions and GitHub settings remain unresolved.

## Working-tree rules

- Inspect the current branch and working-tree changes before Git operations.
- Preserve unrelated user changes; stage only files intended for the task.
- Do not commit credentials, secrets, or sensitive data.
- Avoid rewriting shared history. Discuss destructive operations and force pushes before performing them unless explicitly authorized.
- Resolve conflicts by understanding the intended behavior on both sides and validate the result.

## Repository and branches

- GitHub repository URL: [TODO]
- Default branch: [TODO]
- Branch naming pattern: [TODO]
- Branch-per-task policy: [TODO]
- Branch synchronization strategy: [TODO: merge or rebase, and where each is appropriate]
- Branch cleanup policy: [TODO]

## Commits

- Message format: [TODO: conventional commits or another format]
- Commit scope and size: [TODO]
- Issue references: [TODO]
- Signing requirements: [TODO]
- Generated files and lockfile policy: [TODO]

## Pull requests

- Title format: [TODO]
- Draft PR usage: [TODO]
- Required reviewers / code owners: [TODO]
- Review expectations: [TODO]

Include the following in a pull request description:

- Problem and resulting behavior.
- Relevant implementation choices and tradeoffs.
- Validation performed and results.
- Linked issue or requirements, when applicable.
- Screenshots for meaningful visual changes, when applicable.
- Migration, rollout, or compatibility implications, when applicable.

## GitHub checks and merge policy

- CI workflows and required checks: [TODO: link to actual workflow files once created]
- Branch protection or rulesets: [TODO]
- Required approval count: [TODO]
- Merge strategy: [TODO: squash, merge commit, or rebase]
- Who may merge and release: [TODO]

Documented settings are intended policy until actually configured in GitHub. Required validation commands live in [testing.md](testing.md).

## Issues and releases

- Issue format, labels, and prioritization: [TODO]
- Milestones or project board: [TODO: if used]
- Version and tag format: [TODO]
- Release notes and changelog process: [TODO]
- Deployment relationship: see [deployment.md](deployment.md).
