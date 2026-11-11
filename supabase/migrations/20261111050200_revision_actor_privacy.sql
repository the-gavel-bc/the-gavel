-- Revisions are readable by anyone who can read the article, but actor_user_id
-- is a private Auth ID (often an administrator's). Keep every other column
-- readable and hide that one, as profiles already do for auth_user_id.
revoke select on table public.article_revisions from authenticated;
grant select (id, article_id, created_at, snapshot_version, snapshot) on table public.article_revisions to authenticated;
