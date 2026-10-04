# Coding style

Status: Draft — general rules below apply; project-specific choices remain unresolved.

## General rules

- Follow existing project patterns and configured formatter/linter rules.
- Prefer clear names and straightforward control flow.
- Keep functions and modules focused on a coherent responsibility.
- Introduce abstractions when they clarify actual usage; avoid speculative infrastructure.
- Comment on reasoning, constraints, and surprising behavior rather than restating code.
- Handle expected errors explicitly and preserve useful diagnostic context.
- Keep secrets and sensitive user data out of source code and logs.
- Keep formatting changes focused on files relevant to the task.

## Languages and tooling

- Languages and versions: [TODO]
- Formatter and configuration location: [TODO]
- Linter and configuration location: [TODO]
- Type checking / strictness: [TODO]
- Editor configuration: [TODO]

For actual validation commands, see [testing.md](testing.md).

## Formatting and naming

- Indentation, line length, quotes, and semicolons: [TODO: prefer formatter configuration as the source of truth]
- File and directory names: [TODO]
- Variables, functions, classes, and types: [TODO]
- Component, hook, and test names: [TODO: if applicable]
- Constants and configuration names: [TODO]

## Organization and imports

- Module boundaries and file organization: [TODO: link to architecture.md]
- Import ordering and path aliases: [TODO]
- Public exports and internal helpers: [TODO]
- Shared utilities and reuse rules: [TODO]

## Types, validation, and errors

- Type conventions and permitted escape hatches: [TODO]
- Validation at external boundaries: [TODO]
- Null / missing-value handling: [TODO]
- Error representation and propagation: [TODO]
- Logging conventions and excluded data: [TODO]

## Frontend conventions

- Component and state patterns: [TODO: link to component-hierarchy.md]
- Styling approach: [TODO: link to design-system.md]
- Async operations and data fetching: [TODO]

## Backend conventions

- Handler, business logic, and storage boundaries: [TODO]
- Async operations, timeouts, and retries: [TODO]
- Contract and schema conventions: [TODO: link to api-contracts.md]

## Dependencies and exceptions

- Dependency selection criteria: [TODO]
- Rules for changing established patterns: [TODO]
- Document significant exceptions with their rationale; update this guide when a new convention is adopted.
