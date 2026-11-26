# Operational runbooks

Create a runbook for a specific operational problem once the system and recovery steps are known. Keep instructions executable and verify them in an appropriate environment.

Copy [template.md](template.md) to a descriptive filename and add its link below.

## Index

- [Auth account erasure](auth-account-erasure.md)
- [Import the demo site's articles](demo-article-import.md) (run on production 2026-11-26)
- [Purge an image from article history](purge-article-image.md) (written, not yet exercised end to end)

- [Verified media cache header maintenance](../superpowers/plans/2026-11-09-published-media-authorization.md#maintenance-procedure): approved one-time backfill; requires all writers and cleanup to be stopped.

Still to write and verify against the production services:

- Security incident triage and credential rotation
- Vercel application rollback
- Supabase database restoration
- Member deactivation and session response
- Suspected malicious-content or upload response

Do not publish speculative command sequences as verified procedures.
