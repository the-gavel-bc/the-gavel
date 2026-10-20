# Testing and validation

Status: Foundation tooling implemented; broader MVP coverage remains planned.

## Commands

Run commands with Node.js 22 and the pnpm version recorded in `package.json`.

| Check            | Command             | Current scope                                                    |
| ---------------- | ------------------- | ---------------------------------------------------------------- |
| Formatting       | `pnpm format:check` | Repository source and documentation                              |
| Lint             | `pnpm lint`         | Next.js and TypeScript source                                    |
| Types            | `pnpm typecheck`    | Strict TypeScript compilation                                    |
| Unit/component   | `pnpm test`         | Vitest and Testing Library                                       |
| Browser          | `pnpm test:e2e`     | Playwright desktop and mobile projects                           |
| Production build | `pnpm build`        | Next.js production compilation                                   |
| Database         | `pnpm test:db`      | Local Supabase membership/profile grants and RLS (46 assertions) |

Install the Playwright Chromium runtime once with `pnpm exec playwright install chromium`. Start local Supabase with `pnpm supabase start` using a Docker-compatible runtime. Run `pnpm supabase db reset`, `pnpm test:db`, `pnpm supabase db lint`, and `pnpm db:types:check`. Regenerate formatted types with `pnpm --silent db:types > src/lib/supabase/database.types.ts`. The drift check compares without overwriting the committed file.

## Implemented foundation coverage

- Unit/component tests cover configuration validation/startup, shell semantics, active membership checks, private profile resolution, safe OAuth redirects, and independent dashboard layout/page guards.
- pgTAP covers grants, RLS, profile ownership, inactive-member edit denial, membership read/write/delete denials, administrator approval, scoped profile lookup, and direct-operation denials for non-Google, unconfirmed, and out-of-domain identities.
- Playwright covers desktop/mobile homepage landmarks, keyboard focus/contrast and overflow; signed-out, inactive, unapproved Google, non-`bc.edu`, author, administrator, and forged-cookie access paths. Access tests run with JavaScript disabled.
- Browser fixtures are isolated to the fixed local Docker project. They set synthetic Auth metadata only; passwords and hosted Google credentials are not used. `db reset` restores the original passwordless fixtures.

## CI and security gates

`.github/workflows/ci.yml` installs the frozen lockfile and runs the local gates, generated-type drift check, dependency audit, and Gitleaks v8.30.1 history scan. It needs no production secrets. Hosted CI is triggered by the foundation pull request; review its results separately from local verification.

Temporary CI exception approved on 2026-10-19: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), an unpatched `braces <=3.0.3` advisory in the Next.js ESLint development dependency chain. CI first runs an unfiltered `pnpm audit --prod --audit-level=high`, then configures this advisory ignore on the runner and runs the full high/critical audit. Other high/critical findings remain blocking. No ignore is committed to workspace configuration, so local `pnpm audit --audit-level=high` still reports this advisory.

Remove the CI ignore when a compatible upstream fix is available: update the affected chain/lockfile, remove the ignore command and temporary comments, and verify the unfiltered full audit and lint. This is an accepted temporary risk, not a vulnerability fix. See [ADR 0005](decisions/0005-temporary-ci-audit-exception.md) for scope and removal tracking.

## Required broader MVP coverage

### Critical journeys

- Public reader opens homepage, archives, article, author, search, About, letters, and submission instructions.
- Approved author signs in, creates an article, saves a draft, publishes, edits, and archives it.
- Administrator approves/deactivates members, manages content/taxonomy/homepage settings, restores archives, and permanently deletes with confirmation.
- Unapproved and non-`bc.edu` users are denied dashboard access.

### Authorization

Test anonymous, inactive, author A, author B, and administrator identities against every sensitive operation. Include direct database/API attempts, not only hidden buttons. Prove authors cannot access or mutate another owner's private content, roles, audit records, or administrator settings.

### Content and uploads

- Malicious rich-text and URL payloads remain inert or are rejected.
- Disallowed HTML, scripts, iframes, protocols, and files are rejected.
- Valid images respect size/type/dimension limits and ownership.
- Category/section mismatches and duplicate normalized tags fail safely.

### Public behavior

- Draft and archived records never appear in public data, caches, search, metadata, sitemaps, feeds, or related content.
- Search and all archive types paginate correctly.
- Featured selections use configured items and deterministic fallbacks.
- Slug redirects, metadata, and not-found behavior work.
- Related articles use recent published content from the same section.

### Quality and operations

- Keyboard, focus, semantic, screen-reader, contrast, zoom, reduced-motion, and responsive checks target WCAG 2.2 AA.
- Security headers and cache behavior are verified against deployed previews.
- Dependency and secret scans run in CI.
- Migrations are tested from clean and previous schemas.
- Backup restoration is exercised in a non-production environment before launch.

## Test environment

- Use isolated local/test Supabase data and synthetic identities.
- Never use production secrets or copy private production records into tests.
- Reset deterministic fixtures between tests.
- Protect preview deployments and connect them only to staging services.

## Completion evidence

Every change reports the exact checks run, results, and limitations. No check is called passing unless it completed successfully.
