# Operational runbooks

Create a runbook for a specific operational problem once the system and recovery steps are known. Keep instructions executable and verify them in an appropriate environment.

Copy [template.md](template.md) to a descriptive filename and add its link below.

## Index

- [Auth account erasure](auth-account-erasure.md)
- [Import the demo site's articles](demo-article-import.md)

- [Verified media cache header maintenance](../superpowers/plans/2026-11-09-published-media-authorization.md#maintenance-procedure): approved one-time backfill; requires all writers and cleanup to be stopped.

Runbooks will be added and verified when the corresponding services and commands exist. Required before production:

- Security incident triage and credential rotation
- Vercel application rollback
- Supabase database restoration
- Member deactivation and session response
- Suspected malicious-content or upload response

- [Purge an image from article history](purge-article-image.md) (written, not yet exercised end to end)

Do not publish speculative command sequences as verified procedures.
