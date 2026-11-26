# Git and GitHub workflow

Status: CI runs on every pull request and on `main`. Branch protection settings live in GitHub and are not recorded here. See the [Phase 1 review](reviews/phase-1-foundation.md).

## Repository and branches

- Default branch: `main`.
- Use a short-lived branch per focused task, named by type and intent, such as `feat/article-editor`, `fix/draft-visibility`, or `docs/mvp-requirements`.
- Keep branches synchronized without rewriting shared history.
- Delete merged task branches after release.
- Preserve unrelated working-tree changes.

## Commits

- Use Conventional Commits.
- Keep commits cohesive and reviewable. Target at most 300 changed lines per commit, following the owner’s request for a few hundred lines. Split large tasks into independently testable commits; avoid bulky repeated fixtures. Do not rewrite already-pushed history without an explicit request.
- Include schema, tests, and documentation with the behavior they describe.
- Commit the dependency lockfile.
- Never commit secrets, credentials, production data, or generated local environment files.
- Commit signing is recommended for maintainers and can become required when GitHub ownership is finalized.

## Pull requests

- Use Conventional Commit style for titles.
- Open drafts for work that needs early review.
- Describe the problem, resulting behavior, design choices, validation, security/migration implications, and linked requirement.
- Include screenshots for meaningful public or dashboard visual changes.
- Require review from a maintainer other than the author for authentication, authorization, RLS, migrations, uploads, rich content, or deployment changes. Agent review and a green CI run supplement this human review. If no second maintainer is available, record the requirement as outstanding rather than claiming approval. See the [Phase 1 checklist](reviews/phase-1-foundation.md#maintainer-review-steps) for review scope and evidence.

## Checks and merge policy

Implemented CI checks: formatting, lint, strict types, unit/component tests, RLS/database tests, end-to-end tests for affected critical flows, secret/dependency scanning, and production build. Configuring these as required GitHub branch checks is separate from implementing the workflow.

Use squash merge for task branches unless preserving a deliberate multi-commit history provides value. Protect `main`, prevent direct pushes, require current checks and at least one approval, and restrict production releases to designated maintainers.

## Issues and releases

Use issues with acceptance criteria for meaningful work. Track MVP work in a milestone/project board if helpful. Adopt semantic version tags when production releases begin. Release notes summarize user-visible behavior, migrations, security changes, rollback notes, and known limitations.

## Updating CI executable pins

Pin GitHub Actions to full upstream commit SHAs and container images to registry digests, with readable version comments. Resolve each intended tag through its official upstream repository (peeling annotated tags) or registry, record the resolution in the task evidence, and review the resulting change. Pinning must not silently upgrade versions or expand workflow permissions. Validate action downloads and scanner execution in hosted CI; local syntax checks alone do not prove those steps ran.
