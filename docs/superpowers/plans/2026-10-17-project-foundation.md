# Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reproducible Next.js and Supabase foundation where public pages render, approved members can reach a protected empty dashboard, unauthorized identities are rejected, and every required quality gate runs locally and in CI.

**Architecture:** Use a server-first Next.js App Router application under `src/`, with a single `src/proxy.ts` limited to session refresh and optimistic routing. Server-side authorization functions and PostgreSQL RLS are authoritative. Local Supabase migrations and pgTAP tests define the initial profile/membership boundary; article data is deliberately excluded from this plan.

**Tech Stack:** Next.js 16+, React, strict TypeScript, pnpm, CSS Modules/global CSS, Supabase Auth/PostgreSQL CLI, Zod, Vitest, Testing Library, Playwright, ESLint, Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-16-the-gavel-mvp-design.md`

## Global Constraints

- Use Node.js 22 and record the exact pnpm version in `package.json#packageManager`; commit `pnpm-lock.yaml`.
- Use the Next.js App Router and `src/` layout; do not introduce Pages Router, Tailwind, a component library, an editor, article tables, or production provider configuration in this plan.
- Preserve the existing `screenshots/` files and all unrelated user changes.
- Browser code may receive only the Supabase URL and publishable key; never expose a secret/service-role key or Google client secret.
- A Google identity is not authorization: dashboard access requires an active `memberships` row.
- `src/proxy.ts` may refresh sessions and perform optimistic redirects, but each protected server page/action must independently call the server authorization layer.
- Enable RLS and explicit grants on every exposed table created here.
- Use synthetic local/test identities only; never copy production identities or content.
- Target WCAG 2.2 AA from the first shared layout.
- Mark foundation behavior as implemented in documentation only after the corresponding checks pass.

## Review Focus

- Missing or malformed environment variables must fail at server startup with a safe variable-name error, without echoing values; Task 2 owns this test.
- A valid Google/Supabase session without an active membership must receive the pending/denied experience and never dashboard data; Tasks 4 and 5 own these tests.
- Author A must not read or update Author B's profile or membership through the Data API; Task 4 owns these pgTAP tests.
- Direct navigation to `/dashboard` must be denied server-side even if Proxy is skipped or a client condition is modified; Task 5 owns this test.
- Public layouts must retain skip-link, keyboard focus, semantic landmarks, and responsive navigation behavior; Task 3 owns component and browser tests.

---

## Planned file map

- `package.json`, `pnpm-lock.yaml`, `.nvmrc`: reproducible runtime and scripts.
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`: framework and quality configuration.
- `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`: test runners.
- `src/app/`: App Router pages, layouts, error/not-found boundaries, and OAuth callback.
- `src/components/`: focused shared UI primitives and site shell.
- `src/lib/env/`: validated public and server environment access.
- `src/lib/supabase/`: browser/server clients and session refresh.
- `src/lib/auth/`: membership lookup and server authorization.
- `src/proxy.ts`: session refresh plus optimistic dashboard routing only.
- `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`, `supabase/tests/`: reproducible local data platform and RLS tests.
- `.github/workflows/ci.yml`: deterministic quality checks.
- `docs/decisions/0002-foundation-tooling.md`: accepted foundation-tooling rationale.

### Task 1: Scaffold the web application and quality toolchain

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Test: `src/app/page.test.tsx`
- Test: `e2e/home.spec.ts`
- Modify: `README.md`
- Modify: `docs/testing.md`
- Create: `docs/decisions/0002-foundation-tooling.md`
- Modify: `docs/decisions/README.md`

**Interfaces:**
- Consumes: approved architecture and design documents.
- Produces: scripts `dev`, `build`, `start`, `lint`, `format:check`, `typecheck`, `test`, `test:db`, and `test:e2e`; the `@/*` import alias; a renderable root page.

- [ ] **Step 1: Scaffold Next.js in the repository root**

Use `pnpm create next-app@latest` options equivalent to TypeScript, ESLint, App Router, `src/`, no Tailwind, and `@/*`. Preserve existing documentation and screenshots instead of accepting destructive overwrite prompts. Pin Node 22 in `.nvmrc` and record pnpm through `packageManager`.

- [ ] **Step 2: Install only the foundation dependencies**

Add Vitest, jsdom, Testing Library, Playwright, Prettier, Zod, `@supabase/ssr`, `@supabase/supabase-js`, and Supabase CLI. Do not add UI, editor, analytics, or content dependencies.

- [ ] **Step 3: Write the homepage smoke tests**

`src/app/page.test.tsx` asserts the document heading identifies The Gavel and exposes a link or action toward sign-in. `e2e/home.spec.ts` asserts `/` returns a visible main landmark, heading, and skip link at desktop and mobile viewports.

- [ ] **Step 4: Run the tests to establish the expected failure**

Run: `pnpm test -- src/app/page.test.tsx`
Expected: FAIL until the starter page and test environment use the agreed semantics.

- [ ] **Step 5: Implement the minimal root layout and homepage**

Create a metadata-bearing root layout and a deliberately simple foundation homepage. Do not reproduce the final publication homepage yet.

- [ ] **Step 6: Run the foundation checks**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test -- src/app/page.test.tsx && pnpm build`
Expected: all commands exit 0.

- [ ] **Step 7: Update project documentation**

Record actual setup and validation commands in `README.md` and `docs/testing.md`. Add ADR 0002 for pnpm, Node 22, App Router, CSS Modules, Vitest, Playwright, and local Supabase.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml .nvmrc .gitignore next.config.ts tsconfig.json eslint.config.mjs .prettierrc.json vitest.config.ts vitest.setup.ts playwright.config.ts src/app src/app/page.test.tsx e2e/home.spec.ts README.md docs/testing.md docs/decisions
git commit -m "chore: scaffold application foundation"
```

### Task 2: Add typed environment validation

**Files:**
- Create: `.env.example`
- Create: `src/lib/env/server.ts`
- Create: `src/lib/env/public.ts`
- Test: `src/lib/env/server.test.ts`
- Test: `src/lib/env/public.test.ts`
- Modify: `README.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: Node runtime and Zod from Task 1.
- Produces: `getServerEnv(source?: NodeJS.ProcessEnv): ServerEnv` and `getPublicEnv(source?: PublicEnvSource): PublicEnv`; no other module reads `process.env` directly.

- [ ] **Step 1: Write failing environment tests**

Assert valid values parse, missing names are reported without values, malformed URLs fail, the public schema exposes only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only values never appear in `PublicEnv`.

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm test -- src/lib/env/server.test.ts src/lib/env/public.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the two environment modules**

Keep server and public schemas separate. Return immutable typed objects. Safe errors identify invalid variable names but never interpolate their values.

- [ ] **Step 4: Add a safe example configuration**

Document variable names and localhost examples only. Do not add real project URLs, provider credentials, database passwords, or secret keys.

- [ ] **Step 5: Run focused and full checks**

Run: `pnpm test -- src/lib/env/server.test.ts src/lib/env/public.test.ts && pnpm lint && pnpm typecheck`
Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add .env.example src/lib/env README.md docs/deployment.md
git commit -m "feat: validate runtime configuration"
```

### Task 3: Build the accessible application shells

**Files:**
- Create: `src/app/globals.css`
- Create: `src/components/site/skip-link.tsx`
- Create: `src/components/site/site-header.tsx`
- Create: `src/components/site/site-footer.tsx`
- Create: `src/components/site/public-shell.tsx`
- Create: `src/components/dashboard/dashboard-shell.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/link-button.tsx`
- Test: `src/components/site/public-shell.test.tsx`
- Test: `src/components/dashboard/dashboard-shell.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: root layout and CSS support from Task 1.
- Produces: `PublicShell({ children }: PropsWithChildren)`, `DashboardShell({ children, displayName, isAdmin }: DashboardShellProps)`, and shared link/button primitives.

- [ ] **Step 1: Write failing shell tests**

Assert one banner/main/contentinfo landmark, a skip link targeting `#main-content`, a visible site identity, keyboard-reachable navigation, no admin navigation for `isAdmin=false`, and admin navigation for `isAdmin=true`.

- [ ] **Step 2: Run the component tests to verify failure**

Run: `pnpm test -- src/components/site/public-shell.test.tsx src/components/dashboard/dashboard-shell.test.tsx`
Expected: FAIL because the shells do not exist.

- [ ] **Step 3: Implement semantic shells and foundation tokens**

Define brand-color roles, typography fallbacks, spacing, focus indicators, readable content width, and mobile-first shell layout in `globals.css`. Avoid final screenshot-level styling.

- [ ] **Step 4: Extend the browser smoke test**

Add assertions for keyboard focus reaching the skip link, mobile navigation remaining operable, and no horizontal overflow at the configured mobile viewport.

- [ ] **Step 5: Run component and browser checks**

Run: `pnpm test -- src/components && pnpm test:e2e -- e2e/home.spec.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components e2e/home.spec.ts
git commit -m "feat: add accessible application shells"
```

### Task 4: Create the local Supabase membership boundary

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20261017000000_foundation_identity.sql`
- Create: `supabase/seed.sql`
- Create: `supabase/tests/001_foundation_identity.test.sql`
- Create: `src/lib/supabase/database.types.ts`
- Modify: `package.json`
- Modify: `docs/data-model.md`
- Modify: `docs/security-and-permissions.md`

**Interfaces:**
- Consumes: local Supabase CLI and approved profile/membership model.
- Produces: `public.profiles`, `public.memberships`, enum `public.app_role`, RLS/grants, synthetic fixtures, and generated `Database` TypeScript type.

- [ ] **Step 1: Initialize local Supabase**

Run `pnpm supabase init`. Configure the local project without linking any remote project. Document that a Docker-compatible runtime is required.

- [ ] **Step 2: Write failing pgTAP structure and permission tests**

Assert tables, keys, enum values, RLS enablement, and grants. Seed anonymous, inactive member, Author A, Author B, and Administrator identities. Assert public profile reads expose only intended public fields; users may update only their linked profile; no normal user may insert/update memberships; inactive membership grants no dashboard authorization data; Author A cannot mutate Author B.

- [ ] **Step 3: Run the database tests to verify failure**

Run: `pnpm supabase start && pnpm supabase db reset && pnpm supabase test db`
Expected: pgTAP failures because the migration is absent.

- [ ] **Step 4: Implement the foundation migration**

Create profiles and memberships with constraints, indexes, explicit grants, and RLS policies. Do not create articles or generic role-editing functions. Membership writes remain unavailable to normal authenticated users.

- [ ] **Step 5: Add deterministic synthetic seed data**

Use reserved local-only identities and no real names or email addresses. The seed must be safe to recreate with `db reset`.

- [ ] **Step 6: Regenerate and check database types**

Run: `pnpm supabase gen types --lang typescript --local > src/lib/supabase/database.types.ts`
Run a repository check that fails if regeneration changes the committed file.

- [ ] **Step 7: Run database verification**

Run: `pnpm supabase db reset && pnpm supabase test db && pnpm supabase db lint && pnpm typecheck`
Expected: all commands exit 0 with all pgTAP assertions passing.

- [ ] **Step 8: Update documentation and commit**

Mark only profiles, memberships, local migrations, and their policies as implemented; keep later entities conceptual.

```bash
git add supabase package.json pnpm-lock.yaml src/lib/supabase/database.types.ts docs/data-model.md docs/security-and-permissions.md
git commit -m "feat: establish membership data boundary"
```

### Task 5: Integrate Supabase sessions and protect the dashboard

**Files:**
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/lib/auth/access.ts`
- Create: `src/lib/auth/access.test.ts`
- Create: `src/proxy.ts`
- Create: `src/app/(auth)/sign-in/page.tsx`
- Create: `src/app/(auth)/auth/callback/route.ts`
- Create: `src/app/(auth)/access-pending/page.tsx`
- Create: `src/app/(dashboard)/dashboard/layout.tsx`
- Create: `src/app/(dashboard)/dashboard/page.tsx`
- Test: `src/app/(dashboard)/dashboard/page.test.tsx`
- Test: `e2e/access-boundary.spec.ts`
- Modify: `src/components/site/site-header.tsx`

**Interfaces:**
- Consumes: validated environment access from Task 2, shells from Task 3, and generated database types/tables from Task 4.
- Produces: `createBrowserSupabaseClient()`, `createServerSupabaseClient()`, `refreshSession(request)`, `getCurrentAccess(): Promise<AccessState>`, and `requireActiveMembership(): Promise<ActiveMembership>`.
- `AccessState` is a discriminated union: `signedOut | pending | active`, with active carrying `userId`, `profileId`, `displayName`, and `role`.

- [ ] **Step 1: Write failing access-state tests**

Mock the narrow Supabase calls and assert: missing user -> `signedOut`; user without membership -> `pending`; inactive membership -> `pending`; active author/admin -> typed `active`; database error -> safe server error without token or query leakage.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `pnpm test -- src/lib/auth/access.test.ts`
Expected: FAIL because the access module does not exist.

- [ ] **Step 3: Implement typed Supabase clients and access functions**

Use the official SSR cookie pattern. Do not use a service-role key. Query only the membership/profile fields needed for access decisions.

- [ ] **Step 4: Implement session refresh Proxy**

Place `src/proxy.ts` beside `src/app`. Match `/dashboard/:path*`, `/sign-in`, `/auth/callback`, and `/access-pending`; refresh cookies and treat redirects as convenience only. Do not query slow authorization data or consider Proxy authoritative.

- [ ] **Step 5: Implement sign-in and callback routes**

Offer Google sign-in, restrict redirects to validated local paths, exchange the OAuth code server-side, and send signed-in users to dashboard or pending access. Provider configuration itself remains a documented manual step because credentials are not committed.

- [ ] **Step 6: Write and run protected-page tests**

Assert the dashboard layout calls `requireActiveMembership`; signed-out users redirect to sign-in; pending/inactive users redirect to access-pending; active users render the empty dashboard; author markup has no admin navigation.

Run: `pnpm test -- src/lib/auth/access.test.ts 'src/app/(dashboard)/dashboard/page.test.tsx'`
Expected: PASS.

- [ ] **Step 7: Add access-boundary browser coverage**

Use deterministic local test session helpers rather than real Google login. Assert direct dashboard navigation for signed-out and pending identities is denied even when client JavaScript is disabled; approved authors see the empty dashboard.

- [ ] **Step 8: Run full task verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e -- e2e/access-boundary.spec.ts && pnpm build`
Expected: all commands exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/lib src/proxy.ts 'src/app/(auth)' 'src/app/(dashboard)' src/components/site/site-header.tsx e2e/access-boundary.spec.ts
git commit -m "feat: protect dashboard membership access"
```

### Task 6: Add CI and close the foundation milestone

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/component-hierarchy.md`
- Modify: `docs/deployment.md`
- Modify: `docs/development-workflow.md`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: all scripts and checks from Tasks 1–5.
- Produces: one CI workflow that installs with the frozen lockfile and runs formatting, lint, types, unit/component tests, local Supabase reset/pgTAP/lint/type-generation drift, production build, and Playwright smoke/access tests.

- [ ] **Step 1: Write the CI workflow**

Use least-privilege workflow permissions, pinned major action versions, pnpm cache, a service/runtime capable of local Supabase, and no production secrets. Fail on generated database-type drift.

- [ ] **Step 2: Validate CI-equivalent commands locally**

Run in the same order as CI:
`pnpm install --frozen-lockfile`
`pnpm format:check`
`pnpm lint`
`pnpm typecheck`
`pnpm test`
`pnpm supabase db reset`
`pnpm supabase test db`
`pnpm supabase db lint`
`pnpm build`
`pnpm test:e2e`

Expected: every command exits 0.

- [ ] **Step 3: Verify generated database types are current**

Generate to a temporary file, compare it with `src/lib/supabase/database.types.ts`, and fail if they differ. Do not overwrite the committed file as part of the check.

- [ ] **Step 4: Run manual foundation acceptance checks**

Verify desktop/mobile homepage landmarks and focus, signed-out dashboard denial, pending-member denial, approved-author empty dashboard, no admin controls for authors, no secrets in the client bundle or repository, and no production service dependency.

- [ ] **Step 5: Update documentation to actual behavior**

Replace planned commands and directory descriptions with verified values. Mark only implemented foundation routes/entities/security controls as implemented. Record unavailable hosted Google/Vercel/Supabase checks as remaining launch work.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml README.md docs
git commit -m "ci: enforce foundation quality gates"
```

## Foundation milestone acceptance

- A fresh checkout can install dependencies, start local Supabase, reset the database, and run the application using documented commands.
- The public homepage renders through an accessible responsive shell.
- A signed-out user cannot access `/dashboard`.
- A valid session without an active membership cannot access `/dashboard`.
- An approved author sees an authenticated empty dashboard.
- PostgreSQL RLS prevents unauthorized profile and membership access directly.
- No elevated Supabase credential is required by browser or normal server requests.
- Local formatting, lint, types, unit/component tests, pgTAP tests, database lint, production build, and browser tests pass.
- CI runs the same gates without production secrets.
- Documentation distinguishes implemented foundation behavior from later article, admin, and deployment work.
