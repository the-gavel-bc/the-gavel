# Deployment and operations

Status: Approved operational design — projects and commands are not configured.

## Environments

| Environment | Purpose | Services | Release |
| --- | --- | --- | --- |
| Local | Development and automated tests | Local/isolated Next.js and Supabase | Developer command after scaffolding |
| Staging | Preview and pre-release verification | Protected Vercel previews plus staging Supabase/OAuth | Pull request/preview deployment |
| Production | Public service | Production Vercel, Supabase, OAuth, domain, and monitoring | Protected default-branch release |

Preview environments must never use production database or elevated production secrets.

## Planned configuration

| Variable | Purpose | Public? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Environment-specific Supabase URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key; RLS remains mandatory | Yes |
| Supabase secret key variable | Narrow server-only administrative access if required | No |
| Site URL variable | Canonical URL and redirects | No |
| Monitoring configuration | Error/log destination | No where credentials are involved |

Exact names for server-only values will be selected during implementation. Google provider secrets live in managed Supabase/Google configuration, never documentation or Git.

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
