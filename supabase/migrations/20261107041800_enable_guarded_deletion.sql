-- All deletion, storage-ledger and readiness protections are now installed.
drop trigger guard_article_delete_during_upgrade on public.articles;
