# Current work

- Phase: no feature branch in progress. Everything through PR #172 (2026-11-26) is merged into `main` and live. Stale branches were removed on GitHub and locally; only `main` remains on GitHub.
- Production: Vercel project "the-gavel", hosted Supabase (us-west-2), Google sign-in configured, all migrations through `20261126020000` applied, the 37 demo articles imported. See [deployment](docs/deployment.md#production-setup).
- Open owner actions: choose homepage picks (Dashboard → Homepage); confirm `CRON_SECRET` is set in Vercel so the scheduled cleanup jobs run; decide on a production domain.
- Known gaps: in a local database that holds the imported demo articles, the site-information, taxonomy, homepage and some public reader browser specs fail (they also fail on `main`); a fresh `pnpm supabase db reset` before `pnpm test:e2e` avoids this. Human screen-reader review is still outstanding.
