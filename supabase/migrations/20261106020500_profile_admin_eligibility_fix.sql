create or replace function private.manage_contributor_profile(
  p_operation text,p_profile_id uuid,p_expected_version integer,
  p_request_id uuid,p_display_name text,p_biography text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.profile_write_receipts%rowtype;
  profile public.profiles%rowtype; result jsonb;
  changed boolean := false; next_slug text; next_version integer;
  next_active boolean; created_id uuid; admin_count integer;
begin
  if p_request_id is null or p_operation not in ('create','save','deactivate')
    or (p_operation='create' and (p_profile_id is not null or p_expected_version is not null))
    or (p_operation in ('save','deactivate') and
      (p_profile_id is null or p_expected_version is null or p_expected_version < 1))
    or (p_operation='deactivate' and (p_display_name is not null or p_biography is not null))
    or (p_operation in ('create','save') and (
      p_display_name is null or p_display_name<>pg_catalog.btrim(p_display_name)
      or pg_catalog.char_length(p_display_name) not between 1 and 120
      or p_display_name ~ '[[:cntrl:]]'
      or (p_biography is not null and (
        pg_catalog.char_length(p_biography)>5000
        or pg_catalog.replace(pg_catalog.replace(p_biography,E'\n',''),E'\t','')
          ~ '[[:cntrl:]]')))) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation',p_operation,'profileId',p_profile_id,'expectedVersion',p_expected_version,
    'displayName',p_display_name,'biography',p_biography));
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  select * into receipt from private.profile_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=actor and active
  ) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;

  if p_operation='create' then
    next_slug := private.allocate_profile_slug(p_display_name,null::uuid);
    if next_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
    insert into public.profiles(display_name,slug,biography)
      values(p_display_name,next_slug,p_biography)
      returning id,edit_version,active into created_id,next_version,next_active;
    changed := true;
  else
    select * into profile from public.profiles where id=p_profile_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if profile.edit_version<>p_expected_version or profile.edit_version=2147483647
      or not profile.active then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    created_id := profile.id; next_slug := profile.slug;
    next_version := profile.edit_version; next_active := profile.active;
    if p_operation='save' then
      changed := profile.display_name is distinct from p_display_name
        or profile.biography is distinct from p_biography;
      if changed then
        if profile.display_name is distinct from p_display_name and not profile.slug_frozen then
          next_slug := private.allocate_profile_slug(p_display_name,profile.id);
          if next_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
        end if;
        update public.profiles set display_name=p_display_name,biography=p_biography,
          slug=next_slug,edit_version=edit_version+1 where id=profile.id
          returning edit_version into next_version;
      end if;
    else
      if exists(select 1 from public.articles a where a.owner_profile_id=profile.id
          and a.status in ('published','archived'))
        or exists(select 1 from public.article_contributors c
          join public.articles a on a.id=c.article_id
          where c.profile_id=profile.id and a.status in ('published','archived')) then
        return '{"ok":false,"code":"conflict"}'::jsonb;
      end if;
      if profile.auth_user_id is not null and exists (
        select 1 from public.memberships m where m.user_id=profile.auth_user_id
          and m.active and m.role='administrator') then
        select pg_catalog.count(*) into admin_count from public.memberships m
          join auth.users u on u.id=m.user_id
          join public.profiles p on p.auth_user_id=m.user_id and p.active
          where m.active and m.role='administrator' and u.email_confirmed_at is not null
            and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
            and (u.raw_app_meta_data->>'provider'='google'
              or u.raw_app_meta_data->'providers' ? 'google');
        if admin_count<=1 and exists (select 1 from auth.users u
          where u.id=profile.auth_user_id and u.email_confirmed_at is not null
            and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
            and (u.raw_app_meta_data->>'provider'='google'
              or u.raw_app_meta_data->'providers' ? 'google')) then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
      end if;
      update public.profiles set active=false,edit_version=edit_version+1
        where id=profile.id returning edit_version,active into next_version,next_active;
      changed := true;
    end if;
  end if;
  result := pg_catalog.jsonb_build_object('ok',true,'profileId',created_id,
    'slug',next_slug,'version',next_version,'active',next_active,
    'changed',changed,'replayed',false);
  if changed then
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'profile.'||case p_operation when 'create' then 'created'
        when 'save' then 'updated' else 'deactivated' end,
        'profile',created_id,p_request_id);
  end if;
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,
    profile_id,payload_hash,result)
    values(actor,p_request_id,p_operation,created_id,fingerprint,result);
  return result;
exception when others then
  raise log 'contributor profile write failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
