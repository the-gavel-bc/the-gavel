-- Tags are shared catalog rows; creating one does not grant article access.
create function public.ensure_tag(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_profile uuid;
  normalized text;
  base text;
  candidate text;
  suffix text;
  n integer;
  tag public.tags%rowtype;
  created boolean := false;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if not private.consume_draft_attempt(auth.uid()) then
    return '{"ok":false,"code":"rate_limited"}'::jsonb;
  end if;
  normalized := trim(regexp_replace(p_name,'[[:space:]]+',' ','g'));
  if normalized is null or char_length(normalized) not between 1 and 120 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  -- One lock covers overlapping slug bases, e.g. "topic" and "topic-2".
  -- A fresh SELECT after the wait sees a concurrent creator's committed row.
  perform pg_catalog.pg_advisory_xact_lock(72300320261112::bigint);
  select * into tag from public.tags where lower(name)=lower(normalized);
  if not found then
    base := private.article_slug_base(normalized);
    for n in 1..10000 loop
      suffix := case when n=1 then '' else '-' || n::text end;
      candidate := trim(trailing '-' from left(base,120-char_length(suffix))) || suffix;
      insert into public.tags(name,slug) values(normalized,candidate)
        on conflict do nothing returning * into tag;
      if found then created := true; exit; end if;
      select * into tag from public.tags where lower(name)=lower(normalized);
      if found then exit; end if;
    end loop;
  end if;
  if tag.id is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  return jsonb_build_object('ok',true,'id',tag.id,'name',tag.name,'slug',tag.slug,'created',created);
end;
$$;
revoke all on function public.ensure_tag(text) from public,anon,authenticated;
grant execute on function public.ensure_tag(text) to authenticated;
