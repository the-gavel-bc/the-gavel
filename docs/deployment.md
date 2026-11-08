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
| `SUPABASE_SERVICE_ROLE_KEY`            | Task 3 trusted private image writes and cleanup      | No; server-only                   |
| Monitoring configuration               | Error/log destination                                | No where credentials are involved |

`src/lib/env/public/public.ts` is the only browser configuration boundary and returns only the two `NEXT_PUBLIC_` variables. `src/lib/env/server/server.ts` validates the foundation configuration at startup; the media-only privileged key is checked lazily by `src/lib/supabase/media-admin/media-admin.ts`. Both Supabase URL and `SITE_URL` must be credential-free HTTP(S) origins without paths, query strings, or fragments; publishable keys must contain non-whitespace characters. Validation errors identify invalid variable names without echoing their values. Application modules use these configuration boundaries rather than reading `process.env` directly.

The owner approved a server-only Supabase service-role key for Phase 4 Task 3 validated private image writes and cleanup. `src/lib/supabase/media-admin/media-admin.ts` is the sole client constructor; the key is read lazily and is never returned to the browser or logged. The upload route first checks the user's active session and the reservation's article ownership with a user-scoped client; the service-role-only database finalization RPC independently rechecks the claimed actor and trusted object. Keep the key out of client bundles and previews that use another environment's database. The foundation application and unrelated routes do not require this key. Google provider secrets live in managed Supabase/Google configuration, never documentation or Git.

Use `.env.example` only as a safe local template. Store real local values in the ignored `.env.local` file and hosted values in the relevant Vercel environment. Local, staging, and production values must remain separate.

## Google provider setup (manual, not verified on hosted services)

Configure Google OAuth in the environment-specific Supabase/Google projects, using the provider callback URL shown by Supabase. Configure the canonical application origin and exact `/auth/callback` URL in the Supabase redirect allowlist. Restrict hosted identity creation to the approved `bc.edu` Google domain; the application independently denies non-Google, unconfirmed, non-`bc.edu`, and inactive/unapproved sessions. Keep provider secrets in managed configuration. Local tests do not enable a real Google provider.

Use HTTPS `SITE_URL` values in staging/production so session cookies are Secure. Browser sessions use HttpOnly cookies; foundation authentication and authenticated reads run on the server. Preview protection and hosted OAuth smoke checks remain launch gates.

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

For Phase 4 Task 2, the four generated-article-slug migrations are one release unit. On a site with an older app already serving editorial writes, pause draft create/save traffic and wait for in-flight requests to finish **before** applying `20261102000000`; keep writes paused until `20261102000300` is applied and the local-equivalent RPC smoke checks pass. The intermediate migration states are not compatible with the older app. This repository has no hosted release configured yet, so the first deployment has no existing editorial traffic. After the full chain, the database ignores a valid slug field from an older running app and always derives the stored article slug from title; the new app omits the field. Rolling the app back to the older version remains writable against the completed database chain. Do not contract the old RPC payload shape until old instances and pending retries have drained and a separate compatibility review approves it. Existing article rows and slugs are not rewritten.

For Phase 4 Task 4, apply `20261103020000` through `20261103020400` as one release unit before enabling version 2 body writes. Keep draft writes paused during this chain on an existing deployment. The final validator and media-retention functions are installed by the last migration; intermediate states are not an application contract. Existing version 1 bodies, revision snapshots, and media references are preserved. The application rollback can still read version 1 bodies, but an older editor must treat version 2 content as unsupported and never overwrite it.

For Phase 4 Task 9, apply `20261106010000` through `20261106010400` in order before serving the membership dashboard. The operation RPC migration installs checked writes before revoking direct authenticated membership writes. Existing memberships and linked profiles are preserved. Older application versions have no membership writer, so their sign-in/read flows remain compatible. Rolling back the database to direct membership writes would remove the new audit and last-admin guarantees and requires separate security review; use a forward fix for migration defects.

For Phase 4 Task 10, apply `20261106020000` through `20261106020500` as one release unit before serving contributor controls. The chain adds profile version/freeze state, checked mutations, publication guards, and a bounded admin directory, then closes direct authenticated profile updates. Existing names, slugs, identity links, and credits are preserved; freeze backfill updates timestamps on affected profiles. An older app has no profile editor, so read/sign-in paths remain compatible. Restoring direct writes would allow caller-selected slugs and bypass audit, and requires separate security review.

For Phase 4 Task 11, apply `20261106030000` through `20261106030200` before serving taxonomy controls. The additive version columns default existing sections and categories to version 1; no names, slugs, parent links, or article links are rewritten. Direct table writes remain closed. Roll back application code independently; database rollback requires a reviewed forward fix that preserves receipts and audit events.

For Phase 4 Task 12, apply `20261107010000` and `20261107010100` together before serving the own-profile editor. They extend the private receipt allowlist, add checked own-profile read/save RPCs, and lock identity/membership during saves without rewriting profile rows or restoring direct writes. Application rollback leaves these additive database functions in place; remove them only with a separate compatibility review after older clients and pending retries drain.

For Phase 4 Task 13, apply `20261107020000` through `20261107020400` as one release unit before serving homepage curation. The migrations add empty singleton selection storage, restricted read/save RPCs, a recent-publication index, audit and retry records; existing articles and history are not rewritten. Public homepage rendering is not enabled. Preserve saved selections and receipts during rollback; use a reviewed forward fix for database defects.

## Ownership

Production domain, DNS, GitHub, Vercel, Supabase, Google OAuth, billing, recovery channels, and escalation contacts must be assigned to durable school/faculty-controlled accounts before launch.

Task 15 requires `SUPABASE_SERVICE_ROLE_KEY` and a separately generated `CRON_SECRET` of at least 32 characters in the production Vercel environment before deletion is enabled. `vercel.json` schedules the protected `/api/internal/media-cleanup` endpoint daily; previews do not run cleanup. Run an initial administrator cleanup check after configuring production. Deletion remains unavailable without a healthy check within 48 hours. Monitor failed job invocations and the administrator cleanup page, including oldest key/prefix checks and failed counts. Resolve unknown keys or ownership conflicts without deleting unrelated media; do not remove the permanent registry or ledger. Keep an operational alert for failed or stale cleanup outside the app; alert configuration and hosted recovery exercises are launch prerequisites, not completed by this repository change. Hobby scheduling is daily and approximate; sustained arrivals must remain below sweep capacity. See [Vercel cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) and [Supabase Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects).

Task 14 uses the additive `20261107030000_site_information.sql` migration. It preserves existing audit allowlist entries, including Task 13 homepage curation when present, and initializes all settings unset. Deploy migrations in order and verify clean-install CI before release. Reverting application code can leave the new tables and values intact; deleting them requires separate approval.
