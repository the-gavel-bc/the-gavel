# The Gavel

The Gavel is a security-first public publishing platform for Boston College student journalism. Public readers can discover articles without accounts, while explicitly approved `bc.edu` members use Google sign-in to create and manage content according to owner and administrator permissions.

## Project status

Architecture and MVP requirements are approved. The application shell, local Supabase membership boundary, server-side sign-in/access flow, and protected empty dashboard are implemented. Article editing, publishing, administrator management pages, and hosted provider setup remain planned. Documents describe intended behavior unless explicitly marked implemented.

The CI workflow is implemented; hosted CI execution remains pending. The dependency audit currently fails on an unpatched development-tool advisory; see [testing](docs/testing.md#ci-and-security-gates). The full foundation milestone remains open until that gate is resolved.

## Foundation stack

- Next.js and TypeScript
- Vercel
- Supabase Auth, PostgreSQL, Row Level Security, and Storage
- Google OAuth restricted to approved `bc.edu` members

## Local setup

Requirements:

- Node.js 22 (see `.nvmrc`)
- pnpm 11.25.0 through Corepack

Activate Node.js 22 with your version manager before running project commands. For nvm users, run this inside the repository in each new terminal:

```bash
nvm use
```

The committed `.nvmrc` selects Node 22; it does not automatically switch your shell's Node version. The Next.js configuration disables generated agent rules so starting development preserves the repository's authored `AGENTS.md`.

Install and run the application:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. The application validates these variables at their server or browser boundary:

- `NEXT_PUBLIC_SUPABASE_URL`: environment-specific Supabase URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe key protected by RLS.
- `SITE_URL`: server-only canonical application origin.

The committed values in `.env.example` are localhost examples, not credentials. Keep real values in `.env.local` or the deployment platform; never place secrets in documentation or Git. Local Supabase requires a running Docker-compatible runtime:

```bash
pnpm supabase start
pnpm supabase db reset
pnpm test:db
pnpm supabase db lint
pnpm db:types:check
```

`pnpm supabase` uses the CLI version installed by the project lockfile; a separately installed global `supabase` command may use a different version. Local Supabase Studio is available at `http://127.0.0.1:54323` after startup.

The reset command recreates only the local database with synthetic identities. No hosted project is linked. Copy the local URL and publishable key from `pnpm supabase status` into `.env.local`; elevated keys are not needed. Synthetic seed identities have no passwords and cannot sign in.

Run the current quality gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Playwright is configured for desktop and mobile browser checks. Install its Chromium runtime once with `pnpm exec playwright install chromium`, start local Supabase, then run `pnpm test:e2e`. Browser tests prepare only fixed synthetic users in the local Docker project and verify access with JavaScript disabled.

## Documentation index

| Document                                                                           | Purpose                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Project instructions](AGENTS.md)                                                  | Codex working rules and project preferences                                |
| [Product requirements](docs/product-requirements.md)                               | Users, MVP scope, deferred work, acceptance criteria, and client questions |
| [MVP design](docs/superpowers/specs/2026-10-16-the-gavel-mvp-design.md)            | Approved product, architecture, content, and security design               |
| [Project foundation plan](docs/superpowers/plans/2026-10-17-project-foundation.md) | Test-first scaffolding, local Supabase, membership access, and CI plan     |
| [Architecture](docs/architecture.md)                                               | Systems, boundaries, environments, and data flow                           |
| [Component hierarchy](docs/component-hierarchy.md)                                 | Planned routes and UI responsibilities                                     |
| [API contracts](docs/api-contracts.md)                                             | Interface conventions and planned operations                               |
| [Data model](docs/data-model.md)                                                   | Entities, relationships, constraints, and migrations                       |
| [Design system](docs/design-system.md)                                             | Brand direction, accessibility, and interaction rules                      |
| [Security and permissions](docs/security-and-permissions.md)                       | Authentication, roles, RLS, uploads, and incident preparation              |
| [Testing](docs/testing.md)                                                         | Required verification and future commands                                  |
| [Development workflow](docs/development-workflow.md)                               | Task process and definition of done                                        |
| [Coding style](docs/coding-style.md)                                               | Planned TypeScript and project conventions                                 |
| [Git and GitHub](docs/git-github.md)                                               | Branch, review, CI, and release policy                                     |
| [Deployment](docs/deployment.md)                                                   | Environments, configuration, release, and recovery                         |
| [Decisions](docs/decisions/README.md)                                              | Architecture decision records                                              |
| [Runbooks](docs/runbooks/README.md)                                                | Operational procedures                                                     |
