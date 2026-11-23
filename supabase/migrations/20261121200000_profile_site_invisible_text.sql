-- Preserve exact receipts and the existing read contract for stored text.
create function private.has_unsupported_display_character(p_value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select private.has_unicode_format_character(p_value)
    or pg_catalog.strpos(p_value,U&'\2800')>0
    or pg_catalog.strpos(p_value,U&'\3164')>0;
$$;
revoke all on function private.has_unsupported_display_character(text)
  from public, anon, authenticated, service_role;

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
  if not exists (
    select 1 from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active
  ) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
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
  if private.has_unsupported_display_character(p_display_name)
    or private.has_unsupported_display_character(p_biography) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
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

create or replace function public.create_guest_contributor(p_request_id uuid,p_display_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fingerprint text; profile public.profiles%rowtype;
  receipt private.profile_write_receipts%rowtype; result jsonb; next_slug text; preflight_code text;
begin
  if p_request_id is null or p_display_name is null
    or p_display_name<>btrim(p_display_name) or char_length(p_display_name) not between 1 and 120
    or p_display_name ~ '[[:cntrl:]]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() or not exists (
    select 1 from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active
  ) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  -- A single snapshot preserves exact receipts and screens fresh requests before waiting.
  select case
    when private.has_unsupported_display_character(p_display_name) then 'invalid_input'
    when exists (
      select 1 from private.draft_write_limits limits
      where limits.actor_user_id=actor and limits.attempt_count>=30
        and clock_timestamp()<limits.window_start+interval '60 seconds'
    ) then 'rate_limited'
  end into preflight_code
  where not exists (
    select 1 from private.profile_write_receipts existing_receipt
    where existing_receipt.actor_user_id=actor and existing_receipt.request_id=p_request_id
  );
  if preflight_code is not null then
    return jsonb_build_object('ok',false,'code',preflight_code); end if;
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
  if private.has_unsupported_display_character(p_display_name) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
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

create or replace function public.save_site_information(p_expected_version integer,p_request_id uuid,
  p_mission text,p_contact_email text,p_instagram_url text,p_submission_instructions text,
  p_spotify_url text,p_linkedin_url text,p_facebook_url text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_row public.site_information%rowtype;
  receipt private.site_information_receipts%rowtype; fingerprint text; changed boolean; result jsonb;
begin
  if p_expected_version is null or p_expected_version<1 or p_request_id is null
    or (p_mission is not null and (char_length(p_mission) not between 1 and 5000
      or p_mission ~ '[<>]' or replace(replace(p_mission,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
    or (p_submission_instructions is not null and (char_length(p_submission_instructions) not between 1 and 5000
      or p_submission_instructions ~ '[<>]' or replace(replace(p_submission_instructions,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
    or (p_contact_email is not null and not private.is_valid_contact_email(p_contact_email))
    or (p_instagram_url is not null and (char_length(p_instagram_url)>255 or p_instagram_url !~
      '^https://(www\.)?instagram\.com/[A-Za-z0-9._/]+$'))
    or (p_spotify_url is not null and not private.is_valid_social_url('spotify',p_spotify_url))
    or (p_linkedin_url is not null and not private.is_valid_social_url('linkedin',p_linkedin_url))
    or (p_facebook_url is not null and not private.is_valid_social_url('facebook',p_facebook_url))
  then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=actor and p.active) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(pg_catalog.jsonb_build_object('operation','site_information.save',
    'version',p_expected_version,'mission',p_mission,'email',p_contact_email,
    'instagram',p_instagram_url,'instructions',p_submission_instructions,
    'spotify',p_spotify_url,'linkedin',p_linkedin_url,'facebook',p_facebook_url));
  select * into receipt from private.site_information_receipts where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if private.has_unsupported_display_character(p_mission)
    or private.has_unsupported_display_character(p_submission_instructions) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select * into current_row from public.site_information where id='00000000-0000-0000-0000-000000000002'::uuid for update;
  if current_row.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  changed:=current_row.mission is distinct from p_mission or current_row.contact_email is distinct from p_contact_email
    or current_row.instagram_url is distinct from p_instagram_url or current_row.submission_instructions is distinct from p_submission_instructions
    or current_row.spotify_url is distinct from p_spotify_url or current_row.linkedin_url is distinct from p_linkedin_url
    or current_row.facebook_url is distinct from p_facebook_url;
  if changed and current_row.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if changed then
    update public.site_information set mission=p_mission,contact_email=p_contact_email,instagram_url=p_instagram_url,
      submission_instructions=p_submission_instructions,spotify_url=p_spotify_url,
      linkedin_url=p_linkedin_url,facebook_url=p_facebook_url,edit_version=edit_version+1
      where id=current_row.id returning edit_version into current_row.edit_version;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'site_information.updated','site_information',current_row.id,p_request_id);
  end if;
  result:=pg_catalog.jsonb_build_object('ok',true,'version',current_row.edit_version,'changed',changed,'replayed',false);
  insert into private.site_information_receipts(actor_user_id,request_id,payload_hash,result)
    values(actor,p_request_id,fingerprint,result);
  return result;
exception when others then
  raise log 'site information save failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
