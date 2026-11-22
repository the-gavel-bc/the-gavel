-- Allocate new taxonomy slugs without changing slug values on existing rows.
create function private.taxonomy_slug_base(p_name text)
returns text language sql stable strict set search_path = '' as $$
  select coalesce(
    nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
      pg_catalog.lower(extensions.unaccent(p_name)) collate "C", '[^a-z0-9]+', '-', 'g'
    ), '-'), ''),
    'n-' || pg_catalog.left(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_name, 'UTF8')), 'hex'), 8)
  );
$$;

create function private.is_reserved_taxonomy_slug(p_slug text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_slug in (
    'search', 'authors', 'tags', 'sections', 'letters', 'about',
    'api', 'dashboard', 'sign-in', 'auth', 'sitemap.xml', 'robots.txt'
  );
$$;
revoke all on function private.taxonomy_slug_base(text), private.is_reserved_taxonomy_slug(text)
  from public, anon, authenticated, service_role;

create or replace function public.create_taxonomy(
  p_kind text, p_request_id uuid, p_name text, p_navigation_order integer,
  p_parent_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.taxonomy_write_receipts%rowtype; base text; candidate text;
  suffix text; n integer; new_id uuid; new_slug text; result jsonb;
begin
  if p_kind not in ('section','category') or p_request_id is null
    or p_name is null or p_name <> pg_catalog.btrim(p_name)
    or pg_catalog.char_length(p_name) not between 1 and 120 or p_name ~ '[[:cntrl:]]'
    or p_navigation_order is null or p_navigation_order < 0
    or (p_kind = 'section' and p_parent_id is not null)
    or (p_kind = 'category' and p_parent_id is null) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','create','kind',p_kind,'name',p_name,'order',p_navigation_order,
    'parent',p_parent_id));
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into receipt from private.taxonomy_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if p_kind = 'section'
    and (select count(*) from public.sections where active) >= 100 then
    return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  base := private.taxonomy_slug_base(p_name);
  if p_kind = 'category' then
    perform 1 from public.sections where id=p_parent_id for share;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if not exists (select 1 from public.sections where id=p_parent_id and active) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  end if;
  for n in 1..1000 loop
    suffix := case when n = 1 then '' else '-' || n::text end;
    candidate := pg_catalog.rtrim(pg_catalog.left(base,120 - pg_catalog.char_length(suffix)),'-') || suffix;
    if p_kind = 'section' then
      if private.is_reserved_taxonomy_slug(candidate) then continue; end if;
      if exists (select 1 from public.sections where slug=candidate) then continue; end if;
      insert into public.sections(name,slug,navigation_order)
        values(p_name,candidate,p_navigation_order) returning id,slug into new_id,new_slug;
    else
      if exists (select 1 from public.categories where section_id=p_parent_id and slug=candidate) then continue; end if;
      insert into public.categories(section_id,name,slug,navigation_order)
        values(p_parent_id,p_name,candidate,p_navigation_order) returning id,slug into new_id,new_slug;
    end if;
    exit;
  end loop;
  if new_id is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,p_kind||'.created',p_kind,new_id,p_request_id);
  result := pg_catalog.jsonb_build_object('ok',true,'kind',p_kind,'id',new_id,
    'slug',new_slug,'replayed',false);
  insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
    values(actor,p_request_id,p_kind,new_id,fingerprint,result);
  return result;
exception when unique_violation then
  -- A section or category with this name already exists.
  return '{"ok":false,"code":"conflict"}'::jsonb;
end;
$$;

create or replace function public.ensure_tag(p_name text) returns jsonb
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
  normalized := trim(regexp_replace(p_name,U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'));
  if normalized is null or char_length(normalized) not between 1 and 120
    or normalized ~ U&'[\0001-\001F\007F-\009F]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  -- One lock covers overlapping slug bases, e.g. "topic" and "topic-2".
  -- A fresh SELECT after the wait sees a concurrent creator's committed row.
  perform pg_catalog.pg_advisory_xact_lock(72300320261112::bigint);
  select * into tag from public.tags where lower(name)=lower(normalized);
  if not found then
    base := private.taxonomy_slug_base(normalized);
    for n in 1..10000 loop
      suffix := case when n=1 then '' else '-' || n::text end;
      candidate := trim(trailing '-' from left(base,120-char_length(suffix))) || suffix;
      if private.is_reserved_taxonomy_slug(candidate) then continue; end if;
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
