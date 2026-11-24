# Import the demo site's articles

Use to copy the demo site's articles into a Gavel database. Plan and decisions: [demo article import](../superpowers/plans/2026-11-24-demo-article-import.md); design: [ADR 0015](../decisions/0015-demo-article-import.md).

1. Apply migrations through `20261124030000_demo_article_import.sql` (it needs the corrections migration `20261124020000`).
2. Export the demo to a folder outside the repository:
   `DEMO_SUPABASE_URL=https://<demo-ref>.supabase.co DEMO_SUPABASE_KEY=<key> node scripts/demo-import/export.mjs <folder>`.
   The demo's publishable key returns published articles only; drafts need the demo service key. Review `<folder>/demo-export.json`.
3. Dry run (writes nothing): `GAVEL_SUPABASE_URL=<target url> GAVEL_SERVICE_ROLE_KEY=<target service key> node scripts/demo-import/import.mjs <folder> --actor <administrator user id>`. Fix every "Skipped" or "Refused" line (usually `scripts/demo-import/taxonomy-map.json`) before going on.
4. Hosted target only: take a database backup first and get the owner's approval. Add `--confirm <target project ref>`.
5. Import: the same command with `--apply`. It is safe to run again; already imported articles are skipped and changed demo articles are reported, never overwritten.
6. Check a few articles at `/articles/<slug>`, a section page, search, and the review queue for imported drafts. Pick demo "featured" stories for the homepage by hand (the report lists them).

Rollback: local, reset the database. Hosted, restore the backup, or archive and delete the imported articles listed in `private.demo_import_ledger` as an administrator (deletion is permanent; get approval first).
