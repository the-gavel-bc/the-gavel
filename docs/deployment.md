# Deployment and operations

Status: Typed local configuration implemented; hosted projects and releases are not configured.

## Environments

| Environment | Purpose                              | Services                                                   | Release                             |
| ----------- | ------------------------------------ | ---------------------------------------------------------- | ----------------------------------- |
| Local       | Development and automated tests      | Local/isolated Next.js and Supabase                        | Developer command after scaffolding |
| Staging     | Preview and pre-release verification | Protected Vercel previews plus staging Supabase/OAuth      | Pull request/preview deployment     |
| Production  | Public service                       | Production Vercel, Supabase, OAuth, domain, and monitoring | Protected default-branch release    |

Preview environments must never use production database or elevated production secrets.

## Configuration

| Variable                               | Purpose                                              | Public?                           |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Environment-specific Supabase URL                    | Yes                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key; RLS remains mandatory  | Yes                               |
| `SITE_URL`                             | Canonical application origin and redirect validation | No                                |
| Monitoring configuration               | Error/log destination                                | No where credentials are involved |

`src/lib/env/public.ts` is the only browser configuration boundary and returns only the two `NEXT_PUBLIC_` variables. `src/lib/env/server.ts` validates the complete application configuration. Validation errors identify invalid variable names without echoing their values. Application modules must use these typed accessors instead of reading `process.env` directly.

No Supabase secret/service-role key is required by the foundation application. If a later administrator workflow requires elevated service access, its name, server-only boundary, and threat model require a separate approved decision. Google provider secrets live in managed Supabase/Google configuration, never documentation or Git.

Use `.env.example` only as a safe local template. Store real local values in the ignored `.env.local` file and hosted values in the relevant Vercel environment. Local, staging, and production values must remain separate.

## Release requirements

- Approved change and required review.
- Passing lint, types, tests, database/RLS tests, migration verification, and production build.
- Preview validation for behavior, accessibility, headers, caching, and responsive layouts.
- Additive database migrations applied in a compatible order.
- Post-release smoke tests for homepage, article, search, sign-in, dashboard authorization, and media.
- Rollback path confirmed before risky schema or authentication changes.

## Monitoring

Monitor application errors, function failures, authentication anomalies, permission failures, publication/admin activity, suspicious uploads, database health, storage use, traffic/firewall events, and spending thresholds. Persist logs long enough to investigate incidents without logging secrets or article drafts unnecessarily.

## Backups and recovery

- Configure automatic PostgreSQL backups appropriate to the selected Supabase plan.
- Enable suitable object recovery/versioning or separate media backups.
- Keep recovery access separate from normal author permissions.
- Test restoration before launch and on a recurring schedule.
- Infrastructure configuration, schema migrations, and code in Git must be sufficient to rebuild a clean application environment.

## Rollback

Application releases use Vercel rollback/promotion capabilities. Database changes require migration-specific rollback or forward-fix procedures that preserve data. Never roll application code back across an incompatible destructive migration without a tested compatibility plan.

## Ownership

Production domain, DNS, GitHub, Vercel, Supabase, Google OAuth, billing, recovery channels, and escalation contacts must be assigned to durable school/faculty-controlled accounts before launch.
