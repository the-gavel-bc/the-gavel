create or replace function public.save_own_public_profile(
  p_expected_version integer,p_request_id uuid,p_display_name text,p_biography text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); profile public.profiles%rowtype;
  receipt private.profile_write_receipts%rowtype; fingerprint text;
  next_slug text; next_version integer; changed boolean; result jsonb;
begin
  if p_expected_version is null or p_expected_version<1 or p_request_id is null
    or p_display_name is null or p_display_name<>pg_catalog.btrim(p_display_name)
    or pg_catalog.char_length(p_display_name) not between 1 and 120
    or p_display_name ~ '[[:cntrl:]]'
    or (p_biography is not null and (pg_catalog.char_length(p_biography)>5000
      or pg_catalog.replace(pg_catalog.replace(p_biography,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
  then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  select p.* into profile from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active for update of p;
  if not found or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','save_own','profileId',profile.id,'expectedVersion',p_expected_version,
    'displayName',p_display_name,'biography',p_biography));
  select * into receipt from private.profile_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if profile.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  changed:=profile.display_name is distinct from p_display_name or profile.biography is distinct from p_biography;
  if changed and profile.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  next_slug:=profile.slug; next_version:=profile.edit_version;
  if changed then
    if profile.display_name is distinct from p_display_name and not profile.slug_frozen then
      next_slug:=private.allocate_profile_slug(p_display_name,profile.id);
      if next_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
    end if;
    update public.profiles set display_name=p_display_name,biography=p_biography,
      slug=next_slug,edit_version=edit_version+1 where id=profile.id returning edit_version into next_version;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'profile.updated','profile',profile.id,p_request_id);
  end if;
  result:=pg_catalog.jsonb_build_object('ok',true,'profileId',profile.id,'slug',next_slug,
    'version',next_version,'changed',changed,'replayed',false);
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    values(actor,p_request_id,'save_own',profile.id,fingerprint,result);
  return result;
exception when others then
  raise log 'own profile save failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
