# The Gavel

The Gavel is a security-first public publishing platform for Boston College student journalism. Public readers can discover articles without accounts, while explicitly approved `bc.edu` members use Google sign-in to create and manage content according to owner and administrator permissions.

## Project status

Architecture and MVP requirements are approved. The application shell, local Supabase membership boundary, server-side sign-in/access flow, protected My Articles dashboard, taxonomy schema, private articles, category/tag/contributor associations, protected revision/audit storage, authenticated draft-create/save database operations, and checked private server queries/actions are implemented. The new-draft metadata form is implemented. The constrained body editor, private edit route, taxonomy/contributor selectors and save/conflict recovery are implemented. Phase 3 Task 11 records integrated upgrade, clean-install, security, browser and hosted-CI evidence. Publishing, administrator management pages and hosted provider setup remain planned. Human maintainer, screen-reader, and real-session checks remain outstanding. See [Phase 3 verification and remaining work](docs/testing.md#phase-3-task-11-integrated-verification). Documents describe intended behavior unless explicitly marked implemented.

The CI workflow is implemented and hosted execution is verified; human maintainer review remains outstanding. Production and full dependency audits run without exceptions; see [testing](docs/testing.md#ci-and-security-gates). See the [Phase 1 review and checklist](docs/reviews/phase-1-foundation.md) for evidence and remaining review work.

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

The [Phase 3 private-draft contract](docs/superpowers/specs/2026-10-22-private-draft-workflow-design.md) is accepted, including Tiptap, explicit Save, and controlled atomic mutations. The [implementation plan](docs/superpowers/plans/2026-10-22-phase-three-private-drafts.md) defines task boundaries and review checkpoints; Tasks 2–10 validation, atomic draft create/save, checked server queries/actions, My Articles and private create/edit with a constrained body editor and association selectors and save/retry/conflict/navigation recovery are implemented. Task 11 integrates verification and handoff evidence in [testing](docs/testing.md#phase-3-task-11-integrated-verification) and the [review evidence map](docs/reviews/phase-3-private-drafts.md). See [ADR 0007](docs/decisions/0007-private-draft-editor-and-mutations.md).

## Documentation index

| Document                                                                                    | Purpose                                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Project instructions](AGENTS.md)                                                           | Codex working rules and project preferences                                     |
| [Product requirements](docs/product-requirements.md)                                        | Users, MVP scope, deferred work, acceptance criteria, and client questions      |
| [MVP design](docs/superpowers/specs/2026-10-16-the-gavel-mvp-design.md)                     | Approved product, architecture, content, and security design                    |
| [Project foundation plan](docs/superpowers/plans/2026-10-17-project-foundation.md)          | Test-first scaffolding, local Supabase, membership access, and CI plan          |
| [Phase 2 task plan](docs/superpowers/plans/2026-10-20-phase-two-content-foundation.md)      | Manageable content-data tasks, decision gates, and validation                   |
| [Accepted content contract](docs/superpowers/specs/2026-10-21-content-foundation-design.md) | Approved Task 1 schema and permission design; implementation tracked separately |
| [Architecture](docs/architecture.md)                                                        | Systems, boundaries, environments, and data flow                                |
| [Component hierarchy](docs/component-hierarchy.md)                                          | Planned routes and UI responsibilities                                          |
| [API contracts](docs/api-contracts.md)                                                      | Interface conventions and planned operations                                    |
| [Data model](docs/data-model.md)                                                            | Entities, relationships, constraints, and migrations                            |
| [Design system](docs/design-system.md)                                                      | Brand direction, accessibility, and interaction rules                           |
| [Security and permissions](docs/security-and-permissions.md)                                | Authentication, roles, RLS, uploads, and incident preparation                   |
| [Testing](docs/testing.md)                                                                  | Required verification and future commands                                       |
| [Phase 1 review](docs/reviews/phase-1-foundation.md)                                        | Review evidence, remaining session coverage, and maintainer checklist           |
| [Development workflow](docs/development-workflow.md)                                        | Task process and definition of done                                             |
| [Coding style](docs/coding-style.md)                                                        | Planned TypeScript and project conventions                                      |
| [Git and GitHub](docs/git-github.md)                                                        | Branch, review, CI, and release policy                                          |
| [Deployment](docs/deployment.md)                                                            | Environments, configuration, release, and recovery                              |
| [Decisions](docs/decisions/README.md)                                                       | Architecture decision records                                                   |
| [Runbooks](docs/runbooks/README.md)                                                         | Operational procedures                                                          |
