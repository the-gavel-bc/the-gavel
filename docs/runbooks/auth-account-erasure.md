# Auth account erasure

Use this procedure for an approved hard deletion of an Auth account. Ordinary membership deactivation is reversible and hides the public author page. Prefer deactivation when access needs to be suspended.

## Before erasure

- Verify the subject’s Auth UUID and record approval in the appropriate administrative process.
- Verify that another eligible active administrator remains if the subject is an administrator.
- Confirm point-in-time recovery for the applicable production database. Rehearse the same procedure on a synthetic local account before production use.
- Deactivate the member first through the dashboard when they still have access. This retires an open invitation and refreshes the public shell.

## Erase and verify

Use the authorized Supabase Auth hard-delete operation for the verified UUID. On SQLSTATE `55P03`, another writer holds an editorial lock. Retry after the transaction clears. The database refuses deletion of the last eligible administrator.

Verify that the Auth account and actor-owned receipts and quotas are gone. The article owner profile keeps its ID and receives an anonymous display name and slug. Its public page and photo disappear. Current articles and revision snapshots stay in place. Audit rows keep every existing field except the actor ID, which the Auth foreign key clears. Existing audit details and editorial copy are retained under their separate retention policies.

If hard deletion succeeded and recovery is required, follow the database recovery procedure. Account erasure has no application undo.
