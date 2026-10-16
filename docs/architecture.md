# Architecture

Status: Approved design — implementation has not started.

## System overview

The Gavel will be a server-first Next.js application deployed to Vercel. Supabase provides Google-backed authentication, PostgreSQL, Row Level Security, and object storage. Public requests render only published content. Authenticated mutations pass through server-side application logic and remain subject to database authorization.

```text
Browser
  -> Vercel edge and security controls
  -> Next.js public pages / server actions / route handlers
  -> Supabase Auth, PostgreSQL, and Storage
```

## Technology choices

| Area | Technology | Reason | Status |
| --- | --- | --- | --- |
| Language | TypeScript | Shared types and strict boundary validation | Approved |
| Web framework | Next.js | Server rendering, routing, metadata, and Vercel integration | Approved |
| Hosting | Vercel | Managed deployments, previews, TLS, edge protection, and rollback | Approved |
| Authentication | Supabase Auth with Google | Managed OAuth and Supabase session integration | Approved |
| Database | Supabase PostgreSQL | Relational integrity, search support, migrations, and RLS | Approved |
| Media | Supabase Storage | Managed object storage integrated with RLS | Approved |
| Styling and editor libraries | Not selected | Choose during implementation planning | Open |

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

The exact source tree will be selected during implementation planning. Keep public routes, dashboard features, domain services, validation schemas, Supabase access, and tests in explicit modules rather than a single shared utility layer.

## Quality targets

- WCAG 2.2 AA accessibility target.
- Responsive mobile, tablet, and desktop behavior.
- No known authorization bypass in required role and ownership tests.
- Recoverable deployment and verified database restoration before launch.
- Performance budgets and browser support will be finalized during implementation planning.
