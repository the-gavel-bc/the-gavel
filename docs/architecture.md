# Architecture

Status: Source ownership refactor, dashboard editorial workflows, and local Supabase boundaries implemented on this branch; public article rendering and hosted provider verification remain planned.

## System overview

The Gavel will be a server-first Next.js application deployed to Vercel. Supabase provides Google-backed authentication, PostgreSQL, Row Level Security, and object storage. Public requests render only published content. Authenticated mutations pass through server-side application logic and remain subject to database authorization.

```text
Browser
  -> Vercel edge and security controls
  -> Next.js public pages / server actions / route handlers
  -> Supabase Auth, PostgreSQL, and Storage
```

## Technology choices

| Area           | Technology                 | Reason                                                            | Status                  |
| -------------- | -------------------------- | ----------------------------------------------------------------- | ----------------------- |
| Language       | TypeScript                 | Shared types and strict boundary validation                       | Approved                |
| Web framework  | Next.js                    | Server rendering, routing, metadata, and Vercel integration       | Approved                |
| Hosting        | Vercel                     | Managed deployments, previews, TLS, edge protection, and rollback | Approved                |
| Authentication | Supabase Auth with Google  | Managed OAuth and Supabase session integration                    | Approved                |
| Database       | Supabase PostgreSQL        | Relational integrity, search support, migrations, and RLS         | Approved                |
| Media          | Supabase Storage           | Managed object storage integrated with RLS                        | Approved                |
| Styling        | Global CSS and CSS Modules | Small publication-owned design system                             | Implemented             |
| Editor library | Tiptap                     | Constrained JSON adapter; explicit Save; see ADR 0007             | Accepted; not installed |

## Boundaries and responsibilities

### Browser

- Render accessible public and dashboard interfaces.
- Provide usability validation and safe content presentation.
- Never enforce authorization as the only control.
- Never receive database, OAuth-client-secret, or Supabase secret/service-role credentials.

### Next.js server

- Resolve and validate authenticated sessions.
- Validate all external input.
- Enforce application permissions before mutations.
- Sanitize rich content and coordinate publishing, archiving, search metadata, media references, and audit events.
- Return safe public errors while recording private diagnostics.

### Supabase

- Authenticate Google identities and maintain application sessions.
- Enforce grants, constraints, and Row Level Security.
- Store application data, revision history, and audit records.
- Enforce Storage ownership and access policies.

## Main data flows

### Public read

1. A reader requests a public route.
2. Next.js queries only published, non-archived records.
3. The response is rendered with public metadata and safe cache rules.
4. Drafts are never downloaded for client-side filtering.

### Authentication

1. The user starts Google sign-in through Supabase Auth.
2. The system accepts only the configured `bc.edu` identity boundary.
3. The server verifies the resulting session.
4. An active application membership is required before dashboard access.

### Content mutation

1. The browser submits a typed request to a server action or route handler.
2. The server verifies the session, membership, ownership, and requested transition.
3. Input is validated; rich content and media are sanitized or rejected.
4. PostgreSQL constraints and RLS independently enforce access.
5. The mutation and audit event are committed.
6. Relevant public pages are revalidated.

## Caching and background work

- Public article and listing pages may use framework caching with explicit revalidation after content changes.
- Dashboard and user-specific responses must not enter shared caches.
- Search results must reflect only published content.
- The MVP requires no custom job queue. Scheduled publishing and newsletter delivery are deferred.

## Environments

- Local development uses local or isolated development services.
- Vercel previews use a separate staging Supabase project and protected access.
- Production uses production-only Supabase, OAuth, domain, and secrets.
- Preview deployments must never mutate production data.

## Repository structure

The application keeps one Next.js deployment with explicit source ownership:

```text
src/
  app/                         Next.js routes, layouts, metadata and HTTP entry points
  frontend/
    features/<domain>/         Feature components, hooks, editor adapters and interaction state
    components/                Reusable UI and public/dashboard shells
    lib/                       Browser integrations
    styles/                    Shared presentation styles
  backend/
    <domain>/                  Server Actions, guarded queries and orchestration
    infrastructure/            Server Supabase clients, server environment and startup
  shared/
    <domain>/                  Shared contracts, types and pure validation
    database/                  Generated database types
  instrumentation.ts           Startup entry point
  proxy.ts                     Session-refresh entry point
supabase/                      Database configuration, migrations, SQL tests and seed
scripts/                       Verification and generation tooling
e2e/                           Browser journeys and local synthetic fixtures
.github/                       CI configuration
```

Backend modules cannot import presentation or route entry points. Shared runtime modules cannot import backend, frontend, Node APIs or server platform clients. Presentation may import explicit `use server` entry points and erased backend result types. ESLint resolves both relative and alias imports to enforce these rules; Next.js `server-only` guards protect ordinary backend modules. Presentation ownership does not imply `use client`: existing Server Components retain their rendering behavior. SQL functions and RLS remain authoritative; no Express service or additional deployment is introduced.

See the [ownership refactor plan](superpowers/plans/2026-11-08-frontend-backend-ownership.md) for exact moves, test-only exceptions and verification.

### Following an article save

The route `src/app/(dashboard)/dashboard/articles/[id]/page.tsx` composes the protected editor from `src/frontend/features/articles/`. Its `components/draft-form/use-draft-command.ts` hook calls the explicit Server Action in `src/backend/articles/draft-actions/draft-actions.ts`. Both sides use the request/result contract in `src/shared/articles/draft-contract/`. The action uses the cookie-scoped client in `src/backend/infrastructure/supabase/server/` to call the existing database RPC; SQL still owns authorization, version checks, atomic history and receipts. The hook and save-state reducer preserve the original command across uncertain retries.

The application uses ordinary dynamic rendering for authenticated routes with private/no-store responses. Dashboard editing, private uploads and lifecycle operations are implemented; public article rendering and caching remain Phase 5 work.

## Quality targets

- WCAG 2.2 AA accessibility target.
- Responsive mobile, tablet, and desktop behavior.
- No known authorization bypass in required role and ownership tests.
- Recoverable deployment and verified database restoration before launch.
- Performance budgets and browser support will be finalized during implementation planning.

The private database draft create/save operations are implemented behind explicit caller authorization, validation, versions, quotas, receipts and atomic revision/audit capture. The [API contracts](api-contracts.md#implemented-versioned-draft-saving) describe the callable boundaries. Server-side private article queries/actions are implemented with request-time guards, a cookie-scoped public-key client, explicit no-store fetches and checked payloads/results. Detail content and associations share one embedded PostgREST snapshot. The My Articles route now consumes the checked own-list query using server-rendered rows and native cursor links. Only pagination pending feedback requires a client component; safe read recovery also renders without JavaScript. The constrained client editor/edit route are implemented; association selectors reuse these guarded boundaries, with Task 10 save/conflict reconciliation on the same mutation boundary. Existing direct table writes stay denied.

The Task 7 new-draft page passes empty canonical draft values and eligible catalog choices to a small client form. Its controller calls the existing typed actions and keeps pending commands only in memory; it adds no client Supabase write path or global store. Task 10 keeps inputs editable while a result is pending/unconfirmed, preserving the original submitted payload/UUID/version through retries and later access failures. Confirmed creates open the private edit route only when no newer input would be lost; otherwise the mounted form retains the created identity for a subsequent explicit save. The editor and Task 9 selectors reuse this form boundary.

Task 8 pins 13 explicit MIT Tiptap packages to 3.32.0, including core/ProseMirror/React and only the required extension packages. The enabled schema contains exactly nine node types and three marks; no StarterKit/cloud/Pro/image/table/code extension is enabled. The canonical version-one body remains engine-independent. The adapter validates stored input before loading and removes only verified fixed native defaults; meaningful unsupported data is rejected.

The native JSON byte walk has a separate 2 MiB allowance for fixed-attribute overhead; canonical body/request limits stay 1 MiB/1,100,000 bytes. A dense 2,000-link fixture verifies this distinction against the actual engine and PostgreSQL. The private form's lazy editor entry measures 377,675 raw JS bytes (119,121 gzip), plus 4,915 raw CSS bytes (1,461 gzip), in the inspected production build; these are entry-file sizes, excluding already-shared framework code. Editor loading is isolated to the private form.

Task 9 adds controlled category/tag and contributor fields without a new dependency or schema. Section changes read active matching categories through a guarded, cookie-scoped server action; the form discards stale responses and keeps selected IDs until deliberate removal. Unavailable sections and associations are repairable with generic labels. Existing RPC validation still decides write eligibility, including references deactivated after loading.

Task 10 isolates current input, acknowledged input, committed identity/version and immutable pending commands in a pure save-state reducer. Canonical comparison ignores stored object-key/association order, without rewriting body meaning. Delayed receipts acknowledge only their submitted snapshot; newer valid or invalid native input remains unsaved. A recovery action uses existing private queries to review latest detail/options, followed by an explicit, version-checked local adoption. It adds no database interface or authority.

A dashboard-scoped client provider shares only a leave-check callback. Server shell composition and authorization remain intact; supported Next Link navigation and sign-out consult the guard before leaving/submitting. Draft data, pending commands and recovery references remain in the form's memory, without browser persistence. Full-document unload is best-effort; same-document browser history is not guaranteed blocked. No internal router/history patch is used.

Task 15 introduces a narrow permanent media-cleanup ledger and daily Vercel job for deleted article objects. This is not a general-purpose application job queue. The worker uses bounded leases, retries and retained keys; it does not claim a final erasure time for late uploads.

## Public route composition

The `(public)` Next.js route group owns reader shell data loading and dynamically renders public navigation through the anonymous, no-store client. It does not wrap dashboard or auth route groups. PublicShell remains usable without data for auth screens; frontend presentation receives browser-safe shared navigation types and never imports the backend query. The root homepage path stays `/` after moving its owned files into the public group.
