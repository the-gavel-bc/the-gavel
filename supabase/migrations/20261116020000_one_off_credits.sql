-- One-off credits: a name typed while making an article is only a credit on
-- that article. Credit-only profiles (no linked login) stop being a managed,
-- searchable, linkable directory:
--  * their public author pages no longer exist (anonymous read is members only),
--  * bylines show their names as plain text (no author slug is exposed),
--  * contributor search suggests only people with accounts,
--  * every typed credit is its own row; no name reuse across articles,
--  * the administrator guest-creation operation is removed.
-- Existing credits keep working because they already reference these rows.

drop policy profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles for select to anon
  using (active and auth_user_id is not null);

drop function public.create_guest_contributor(uuid,text,text);

create or replace function public.search_contributors(p_query text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare items jsonb;
begin
  if private.lock_draft_actor() is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_query is null or char_length(p_query) not between 1 and 120 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'slug',p.slug)
    order by p.display_name,p.id),'[]'::jsonb) into items from (
      select id,display_name,slug from public.profiles
      where active and auth_user_id is not null
        and position(lower(p_query) in lower(display_name))>0
      order by display_name,id limit 10
    ) p;
  return jsonb_build_object('ok',true,'items',items);
end;
$$;

create or replace function public.create_guest_contributor(p_request_id uuid,p_display_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fingerprint text; profile public.profiles%rowtype;
  receipt private.profile_write_receipts%rowtype; result jsonb; next_slug text;
begin
  if p_request_id is null or p_display_name is null
    or p_display_name<>btrim(p_display_name) or char_length(p_display_name) not between 1 and 120
    or p_display_name ~ '[[:cntrl:]]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  if private.lock_draft_actor() is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(jsonb_build_object(
    'operation','create_guest_author','displayName',p_display_name));
  select * into receipt from private.profile_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  -- Always a new credit-only row: a one-off credit is never matched to, or
  -- shared with, another person or article by name.
  next_slug:=private.allocate_profile_slug(p_display_name,null::uuid);
  if next_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  insert into public.profiles(display_name,slug) values(p_display_name,next_slug) returning * into profile;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,'profile.created','profile',profile.id,p_request_id);
  result:=jsonb_build_object('ok',true,'id',profile.id,'displayName',profile.display_name,
    'slug',profile.slug,'created',true,'replayed',false);
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    values(actor,p_request_id,'create_guest_author',profile.id,fingerprint,result);
  return result;
end;
$$;

-- Public projections: credit-only people carry no author slug and match no
-- author archive. The definitions are patched in place so every other part of
-- each function stays exactly as released; each rewrite must happen or the
-- migration stops.
do $$
declare
  f record; def text; patched text;
  detail integer := 0; cards integer := 0; archive integer := 0; sitemap integer := 0;
begin
  for f in
    select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'article_contributors'
  loop
    def := pg_catalog.pg_get_functiondef(f.oid);
    patched := def;
    -- article detail: contributor credit
    patched := pg_catalog.regexp_replace(patched,
      '''slug'',p\.slug,(\s*)''role'',ac\.contribution_role',
      '''slug'',case when p.auth_user_id is null then null else p.slug end,\1''role'',ac.contribution_role','g');
    if patched is distinct from def then detail := detail + 1; end if;
    def := patched;
    -- cards and homepage cards: writer credit
    patched := pg_catalog.replace(patched,
      'jsonb_build_object(''displayName'',cp.display_name,''slug'',cp.slug)',
      'jsonb_build_object(''displayName'',cp.display_name,''slug'',case when cp.auth_user_id is null then null else cp.slug end)');
    if patched is distinct from def then cards := cards + 1; end if;
    def := patched;
    -- author archive membership
    patched := pg_catalog.replace(patched,
      'and cp.active and cp.slug=p_primary)',
      'and cp.active and cp.auth_user_id is not null and cp.slug=p_primary)');
    if patched is distinct from def then archive := archive + 1; end if;
    def := patched;
    -- sitemap authors
    patched := pg_catalog.replace(patched,
      'select cp.slug from public.article_contributors ac',
      'select cp.slug from public.article_contributors ac join public.profiles gp on gp.id=ac.profile_id and gp.auth_user_id is not null');
    if patched is distinct from def then sitemap := sitemap + 1; end if;
    if patched is distinct from pg_catalog.pg_get_functiondef(f.oid) then
      execute patched;
    end if;
  end loop;
  if detail < 1 or cards < 2 or archive < 1 or sitemap < 1 then
    raise exception 'One-off credit patch did not match (detail %, cards %, archive %, sitemap %).',
      detail, cards, archive, sitemap;
  end if;
end $$;
