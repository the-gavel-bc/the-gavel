-- Keep the applied allocator intact; remove its shadowed loop declaration forward.
create or replace function private.allocate_article_slug(p_title text,p_article_id uuid default null)
returns text language plpgsql volatile set search_path = '' as $$
declare base text := private.article_slug_base(p_title); candidate text; suffix text; holder uuid;
begin
  -- One transaction lock covers collisions between bases such as "news" and
  -- "news-2" as well as concurrent writes of the same title.
  perform pg_catalog.pg_advisory_xact_lock(72300320261102::bigint);
  for n in 1..10000 loop
    suffix := case when n=1 then '' else '-' || n::text end;
    candidate := trim(trailing '-' from pg_catalog.left(base,180-pg_catalog.char_length(suffix))) || suffix;
    select id into holder from public.articles where slug=candidate;
    if holder is null or holder=p_article_id then return candidate; end if;
  end loop;
  return null;
end;
$$;
