-- The later deletion RPC is not usable until cleanup readiness is installed.
create function private.guard_article_delete_during_upgrade() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is not null then raise exception 'Article deletion is not yet enabled' using errcode='42501'; end if;
 return old;
end $$;
create trigger guard_article_delete_during_upgrade before delete on public.articles
 for each row execute function private.guard_article_delete_during_upgrade();
revoke all on function private.guard_article_delete_during_upgrade() from public,anon,authenticated;
