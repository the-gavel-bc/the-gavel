# Git and GitHub workflow

Status: Approved baseline policy — GitHub rules are not yet configured.

## Repository and branches

- Default branch: `main`.
- Use a short-lived branch per focused task, named by type and intent, such as `feat/article-editor`, `fix/draft-visibility`, or `docs/mvp-requirements`.
- Keep branches synchronized without rewriting shared history.
- Delete merged task branches after release.
- Preserve unrelated working-tree changes.

## Commits

- Use Conventional Commits.
- Keep commits cohesive and reviewable.
- Include schema, tests, and documentation with the behavior they describe.
- Commit the dependency lockfile.
- Never commit secrets, credentials, production data, or generated local environment files.
- Commit signing is recommended for maintainers and can become required when GitHub ownership is finalized.

## Pull requests

- Use Conventional Commit style for titles.
- Open drafts for work that needs early review.
- Describe the problem, resulting behavior, design choices, validation, security/migration implications, and linked requirement.
- Include screenshots for meaningful public or dashboard visual changes.
- Require review from a maintainer other than the author for authentication, authorization, RLS, migrations, uploads, rich content, or deployment changes.

## Checks and merge policy

Planned required checks: formatting, lint, strict types, unit/integration tests, RLS/database tests, end-to-end tests for affected critical flows, secret/dependency scanning, and production build.

Use squash merge for task branches unless preserving a deliberate multi-commit history provides value. Protect `main`, prevent direct pushes, require current checks and at least one approval, and restrict production releases to designated maintainers.

## Issues and releases

Use issues with acceptance criteria for meaningful work. Track MVP work in a milestone/project board if helpful. Adopt semantic version tags when production releases begin. Release notes summarize user-visible behavior, migrations, security changes, rollback notes, and known limitations.
