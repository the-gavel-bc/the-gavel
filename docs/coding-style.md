# Coding style

Status: Foundation conventions implemented; formatter and linter configuration are committed, with dependency versions recorded in package.json and the lockfile.

## Language and type safety

- Use strict TypeScript for application code.
- Validate untrusted input at every external boundary.
- Avoid `any`; narrow `unknown` through schemas or type guards.
- Represent domain states with explicit types rather than loosely related booleans.
- Keep database-generated types and migration state synchronized.
- Handle nullable values explicitly.

## Naming and organization

- React components and exported types: PascalCase.
- Functions, variables, hooks, and module instances: camelCase.
- Constants and environment-variable names: uppercase snake case where conventional.
- Route and general file names: lowercase kebab case unless framework conventions require otherwise.
- Tests describe observable behavior and security boundaries.
- Organize by focused feature/domain boundaries; avoid generic dumping-ground utility modules.

## Components and data

- Prefer server components for public reads and non-interactive composition.
- Use client components only where browser state or interaction requires them.
- Keep authoritative state on the server; avoid duplicating server records in global client state.
- Use semantic HTML before custom ARIA.
- Keep loading, empty, error, disabled, success, and unsaved states explicit.

## Server and database

- Separate transport/form handling, domain rules, and persistence concerns.
- Apply timeouts and bounded retries only to safe, idempotent operations.
- Use parameterized queries and Supabase APIs; never concatenate SQL from requests.
- Centralize lifecycle and permission decisions in named domain functions while retaining RLS enforcement.
- Use transactions for mutations that must atomically change content and audit state.

## Errors and logging

- Return stable, safe errors to clients.
- Preserve correlation and diagnostic context privately.
- Never log passwords, session tokens, OAuth tokens, secret keys, full request headers, or unnecessary personal/article-draft content.
- Do not silently ignore expected failures.

## Formatting and imports

Use the repository's configured Prettier formatter and ESLint checks. Prefer automatic formatting as the source of truth. Group imports consistently, use a single documented path alias, avoid circular dependencies, and keep public exports deliberate.

## Dependencies

Add a dependency only when it is maintained, compatible, security-appropriate, and meaningfully reduces project risk or complexity. Pin with the lockfile, review transitive impact, and avoid packages for trivial behavior.
