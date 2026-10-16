# Project instructions

## Working agreement

- Read relevant project documentation before changing code. Use README.md as the documentation index.
- Follow the user's explicit scope and acceptance criteria. If a request conflicts with documentation, explain the conflict and update affected documentation to reflect the user's direction.
- Ask for clarification when missing information materially changes product behavior, architecture, or an API contract. Use judgment for routine implementation details.
- Treat `[TODO: ...]` fields as unresolved information, not requirements or implemented functionality. Do not invent project decisions to fill them.
- Preserve existing user changes and follow established project patterns.
- Keep changes focused. Explain why any new dependency or wider refactor is necessary.
- For significant features or refactors, keep a short implementation plan with acceptance criteria and validation steps.

## Documentation responsibilities

- Read docs/product-requirements.md for scope and intended behavior.
- Read docs/architecture.md, docs/component-hierarchy.md, and docs/data-model.md before structural changes.
- Read docs/api-contracts.md before adding or changing an interface.
- Read docs/design-system.md for UI changes and docs/security-and-permissions.md for access or sensitive-data changes.
- Follow docs/development-workflow.md and docs/testing.md for development and verification.
- Follow docs/coding-style.md when writing code and docs/git-github.md for Git and GitHub operations.
- Consult docs/deployment.md and docs/runbooks/README.md for operational work.
- Update affected documentation alongside code. Distinguish proposed behavior from implemented behavior.
- Record significant technical choices in docs/decisions/ using the provided template.
- Keep each requirement or schema authoritative in one place; link to it elsewhere.

## Completion

- Run the documented checks relevant to the change. If commands are unspecified, identify appropriate checks from the actual project configuration.
- Never claim a check passed unless it ran successfully. Report checks that could not be run and why.
- Summarize what changed, how it was verified, and any remaining limitations or unresolved decisions.

## Project-specific preferences

- Communication style: concise progress updates, evidence-backed conclusions, and explicit unresolved decisions.
- Coding conventions: see docs/coding-style.md.
- Changes requiring discussion first: authentication/authorization model, public URL changes, content lifecycle changes, destructive migrations, new external services, and additions to MVP scope.
- Definition of done beyond the rules above: test role and ownership denials, update affected documentation, verify accessibility/security implications, and report commands actually run.
