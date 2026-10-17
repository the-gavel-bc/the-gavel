# The Gavel

The Gavel is a security-first public publishing platform for Boston College student journalism. Public readers can discover articles without accounts, while explicitly approved `bc.edu` members use Google sign-in to create and manage content according to owner and administrator permissions.

## Project status

Architecture and MVP requirements are approved. The Next.js application and quality toolchain are scaffolded; content, authentication, and publishing features remain planned. Documents describe intended behavior unless explicitly marked implemented.

## Foundation stack

- Next.js and TypeScript
- Vercel
- Supabase Auth, PostgreSQL, Row Level Security, and Storage
- Google OAuth restricted to approved `bc.edu` members

## Local setup

Requirements:

- Node.js 22 (see `.nvmrc`)
- pnpm 11.25.0 through Corepack

Install and run the application:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Never place actual secrets in documentation or commit them to Git. Local Supabase setup and environment variables will be documented when those foundation tasks are implemented.

Run the current quality gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Playwright is configured for desktop and mobile browser checks. Install its Chromium runtime once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`.

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
