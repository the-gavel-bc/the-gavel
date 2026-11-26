# Coding style

Status: In use. Formatter and linter configuration are committed; dependency versions are in package.json and the lockfile.

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

## File colocation

Use a named folder for each component, module, script, or browser-test suite, keeping its implementation and existing companion files together. For example:

```text
src/frontend/components/site/public-shell/
  public-shell.tsx
  public-shell.module.css
  public-shell.test.tsx
src/backend/auth/access/
  access.ts
  access.test.ts
```

Use explicit implementation imports such as `@/frontend/components/site/public-shell/public-shell`; avoid adding barrel files solely to shorten paths. Add styles, tests, types, schemas, or fixtures beside their owner when needed; do not create empty companions. Related suites can use `support/<helper>/<helper>.ts` for genuinely shared helpers.

Component-owned CSS lives beside the component as a CSS Module. Global tokens, resets, and focus rules remain in `src/app/globals.css`; reusable shell styles live in `src/frontend/styles/shell/shell.module.css`. Button and link-button share the button module's styles rather than duplicating them.

Framework and tool conventions take precedence: Next.js route directories already colocate `page.tsx`/`route.ts` and their companions, and root `layout.tsx`, `instrumentation.ts`, `proxy.ts`, metadata, configuration, and test-runner setup stay in their required locations. Startup implementation/tests live together under `src/backend/infrastructure/startup/`, with a thin instrumentation entry point. Supabase migration filenames, SQL tests, seed/configuration, and generated outputs retain tool-compatible conventions; generated database types have their own `src/shared/database/` folder.

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

## Ownership imports

Use frontend/backend/shared ownership as defined in [architecture](architecture.md#repository-structure). Keep existing implementation and companion files together. Do not create pass-through service layers or barrels for folder symmetry. Shared contracts must remain browser-safe; Node fixture readers are test-only and cannot be imported by application code. Frontend may import backend result types with explicit `import type`, and Server Actions with their preserved `use server` directive. Ordinary server modules carry `server-only`. Unit tests map that marker to a test-only stub; production builds retain Next.js enforcement. Import restrictions apply to aliases, relative paths, re-exports and static dynamic imports.

## Comments and intent

Comment code when a reader cannot infer its reason or invariant from the local names and control flow. Explain why a retry preserves its original payload, why a lock or cancellation check exists, which state must survive a failure, or why validation rejects an otherwise plausible input. Put the explanation beside the relevant branch or state transition. Use short JSDoc only when a public helper needs an input/output contract that its types do not explain.

Do not narrate obvious assignments, repeat types, or add a header to every function. Keep durable architecture and product rules in their authoritative docs; link instead of duplicating long explanations in code. Update comments when the corresponding behavior changes. Generated types are not hand-edited, and applied migrations are not rewritten for comment cleanup.
