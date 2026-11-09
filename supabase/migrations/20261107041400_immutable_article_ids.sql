create function private.keep_article_id_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id then raise exception 'Article ID is immutable' using errcode='23514'; end if;
 return new;
end $$;
create trigger article_id_immutable before update of id on public.articles for each row execute function private.keep_article_id_immutable();
revoke all on function private.keep_article_id_immutable() from public,anon,authenticated;
