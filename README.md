# The Gavel

The Gavel is the publishing platform for _The Gavel_, the progressive student newspaper of Boston College. Readers browse and search published articles without an account. Approved `bc.edu` staff sign in with Google to write, review, publish and manage content from a private dashboard.

## Features

- **Public site:** homepage with a curated lead, Featured News and Read This; section, category, tag and author archives; article pages with photos, corrections and related stories; keyword search; sitemap and robots.
- **Editorial dashboard:** private drafts with a structured rich-text editor and body images; review queue for editors; publish, archive, restore and permanent delete; corrections on published articles.
- **Administration:** memberships and roles (author, editor, administrator), contributor credits, sections, categories and tags, homepage curation, site information and the About page, media cleanup and an activity log.
- **Security:** Google sign-in limited to approved `bc.edu` members, row-level security on every table, private media served only for published articles, nonce-based Content Security Policy.

## Stack

| Layer   | Technology                                                                    |
| ------- | ----------------------------------------------------------------------------- |
| App     | Next.js 16 (App Router), React 19, TypeScript                                 |
| Data    | Supabase: PostgreSQL with row-level security, Auth (Google OAuth) and Storage |
| Editor  | Tiptap, stored as a validated JSON document                                   |
| Hosting | Vercel, with scheduled cleanup jobs in `vercel.json`                          |
| Testing | Vitest, Playwright, pgTAP                                                     |
| Tooling | pnpm 11 through Corepack, Node.js 22 (`.nvmrc`), ESLint, Prettier             |

## Getting started

Requirements: Node.js 22, Corepack, and a Docker-compatible runtime for local Supabase.

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm supabase start
pnpm supabase db reset
pnpm dev
```

Copy the local API URL and publishable key from `pnpm supabase status` into `.env.local`, then open `http://localhost:3000`. The local database is seeded with synthetic identities that cannot sign in; browser tests create their own sessions. Local Supabase Studio runs at `http://127.0.0.1:54323`.

Use `pnpm supabase`, not a globally installed `supabase`, so the CLI version matches the lockfile.

## Environment variables

| Variable                               | Where               | Purpose                                                                         |
| -------------------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser and server  | Supabase project origin, with no path (for example `https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server  | Publishable key; row-level security still applies                               |
| `SITE_URL`                             | Server only         | Canonical site origin, used for OAuth redirects, canonical URLs and the sitemap |
| `SUPABASE_SERVICE_ROLE_KEY`            | Server only, secret | Trusted media writes, cleanup jobs and imports                                  |
| `CRON_SECRET`                          | Server only, secret | Authenticates Vercel cron calls to `/api/internal/*`; production only           |

`.env.example` holds local placeholders only. Keep real values in `.env.local` or in Vercel, never in Git or documentation. See [deployment](docs/deployment.md) for the hosted setup.

## Commands

| Command                                              | What it does                                          |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                                           | Development server                                    |
| `pnpm build` / `pnpm start`                          | Production build and server                           |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck` | Formatting, lint and type checks                      |
| `pnpm test`                                          | Unit and component tests (Vitest)                     |
| `pnpm test:db`                                       | Database and permission tests (pgTAP)                 |
| `pnpm test:e2e`                                      | Browser tests, desktop and mobile (Playwright)        |
| `pnpm db:types` / `pnpm db:types:check`              | Regenerate or check generated database types          |
| `pnpm supabase db push`                              | Apply pending migrations to the linked hosted project |

Install the Playwright browser once with `pnpm exec playwright install chromium`. CI runs the same checks on every pull request; see [testing](docs/testing.md).

## Deploying

`main` deploys to production on Vercel. Database changes ship as migrations in `supabase/migrations`: apply them with `pnpm supabase db push` before or together with the app change that needs them, never after. The full checklist, Google OAuth setup, scheduled jobs and rollback rules are in [deployment](docs/deployment.md).

## Project structure

```text
src/app        Routes (public site, dashboard, API routes)
src/frontend   Components and client features
src/backend    Server-only queries, actions and integrations
src/shared     Browser-safe contracts, validation and generated types
supabase       Migrations, pgTAP tests, seed and local config
e2e            Playwright tests
scripts        Checks and one-off tools (such as the demo import)
docs           Requirements, architecture, decisions and runbooks
```

Import boundaries between these folders are enforced by lint; see [architecture](docs/architecture.md#repository-structure).

## Documentation

| Document                                                     | Purpose                                             |
| ------------------------------------------------------------ | --------------------------------------------------- |
| [Product requirements](docs/product-requirements.md)         | Users, scope and acceptance criteria                |
| [Architecture](docs/architecture.md)                         | Systems, boundaries and data flow                   |
| [Component hierarchy](docs/component-hierarchy.md)           | Routes and UI responsibilities                      |
| [API contracts](docs/api-contracts.md)                       | Server actions, routes and database functions       |
| [Data model](docs/data-model.md)                             | Tables, relationships, constraints and migrations   |
| [Security and permissions](docs/security-and-permissions.md) | Authentication, roles, row-level security and media |
| [Design system](docs/design-system.md)                       | Brand, layout, icons and accessibility rules        |
| [Testing](docs/testing.md)                                   | Test layers, commands and CI gates                  |
| [Deployment](docs/deployment.md)                             | Environments, configuration, release and recovery   |
| [Development workflow](docs/development-workflow.md)         | Task process and definition of done                 |
| [Coding style](docs/coding-style.md)                         | TypeScript and project conventions                  |
| [Git and GitHub](docs/git-github.md)                         | Branches, reviews and releases                      |
| [Decisions](docs/decisions/README.md)                        | Architecture decision records                       |
| [Runbooks](docs/runbooks/README.md)                          | Operational procedures                              |
| [Plans](docs/superpowers/plans) and [reviews](docs/reviews)  | Implementation plans and verification history       |
| [Project instructions](AGENTS.md)                            | Working rules for contributors and coding agents    |
