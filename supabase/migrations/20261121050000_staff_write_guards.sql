-- Staff mutation hardening: preserve RPC signatures and receipts.
begin;

create or replace function private.has_unicode_format_character(p_value text)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare cp integer;
begin
  for char_index in 1..pg_catalog.char_length(p_value) loop
    cp := pg_catalog.ascii(pg_catalog.substr(p_value,char_index,1));
    if cp between 1536 and 1541 or cp in (173,1564,1757,1807,2194,6158,
      8203,8204,8205,8206,8207,8234,8235,8236,
      8237,8238,8288,8289,8290,8291,8292,8294,8295,8296,8297,
      8298,8299,8300,8301,8302,8303,65279,65529,65530,65531,69821,69837,
      917505,2274) or cp between 78896 and 78911 or cp between 113824 and 113827
      or cp between 2192 and 2193 or cp between 119155 and 119162
      or cp between 917536 and 917631 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
revoke all on function private.has_unicode_format_character(text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.manage_membership(p_operation text, p_target_user_id uuid, p_expected_version integer, p_request_id uuid, p_role app_role, p_display_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid();
  fingerprint text; old_receipt private.membership_write_receipts%rowtype;
  target_auth record; target_member public.memberships%rowtype;
  target_profile record; member_exists boolean; profile_exists boolean;
  target_eligible_admin boolean; changed boolean := false;
  next_version integer; next_role public.app_role; next_active boolean;
  audit_action text; result jsonb; admin_count integer; retired_invitation_id uuid;
begin
  if p_operation not in ('approve','change_role','deactivate')
    or p_target_user_id is null or p_request_id is null
    or (p_operation = 'approve' and (
      p_role is null or p_display_name is null
      or p_display_name <> pg_catalog.btrim(p_display_name)
      or pg_catalog.char_length(p_display_name) not between 1 and 120
      or p_display_name ~ '[[:cntrl:]]'
      or private.has_unicode_format_character(p_display_name)
      or (p_expected_version is not null and p_expected_version < 1)))
    or (p_operation = 'change_role' and (
      p_role is null or p_display_name is not null
      or p_expected_version is null or p_expected_version < 1))
    or (p_operation = 'deactivate' and (
      p_role is not null or p_display_name is not null
      or p_expected_version is null or p_expected_version < 1)) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;

  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation',p_operation,'target',p_target_user_id,'expectedVersion',p_expected_version,
    'role',p_role,'displayName',p_display_name));
  -- Serialize all membership writes before rechecking actor and last-admin state.
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  -- Auth provider changes do not take the editorial advisory lock. Hold every
  -- counted administrator's identity through commit, and recheck after waits.
  perform u.id from auth.users u
    where u.id in (actor,p_target_user_id) or exists (
      select 1 from public.memberships m
      where m.user_id=u.id and m.active and m.role='administrator')
    order by u.id for share;
  if not private.has_eligible_identity_for(actor) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into old_receipt from private.membership_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if old_receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb;
    end if;
    return pg_catalog.jsonb_set(old_receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=actor and active
  ) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;

  select u.id,u.email,u.email_confirmed_at,u.raw_app_meta_data
    into target_auth from auth.users u where u.id=p_target_user_id for share;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if p_operation='approve' or (p_operation='change_role' and p_role='administrator') then
    if not private.has_eligible_identity_for(p_target_user_id) then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
  end if;

  select * into target_member from public.memberships
    where user_id=p_target_user_id for update;
  member_exists := found;
  if p_operation='approve' then
    select id,active into target_profile from public.profiles
      where auth_user_id=p_target_user_id for update;
    profile_exists := found;
    if profile_exists and not target_profile.active then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    if member_exists then
      if p_expected_version is distinct from target_member.edit_version then
        return '{"ok":false,"code":"conflict"}'::jsonb;
      end if;
      if target_member.active then
        if target_member.role <> p_role then
          return '{"ok":false,"code":"conflict"}'::jsonb;
        end if;
        next_version := target_member.edit_version;
        next_role := target_member.role;
        next_active := true;
      else
        update public.memberships set active=true,role=p_role,approved_by=actor,
          approved_at=pg_catalog.now(),revoked_at=null,
          edit_version=edit_version+1 where user_id=p_target_user_id
          returning edit_version,role,active into next_version,next_role,next_active;
        changed := true;
      end if;
    else
      if p_expected_version is not null then
        return '{"ok":false,"code":"conflict"}'::jsonb;
      end if;
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values(p_target_user_id,p_role,true,actor,pg_catalog.now())
        returning edit_version,role,active into next_version,next_role,next_active;
      changed := true;
    end if;
    if not profile_exists then
      insert into public.profiles(auth_user_id,display_name,slug)
        values(p_target_user_id,p_display_name,private.allocate_profile_slug(p_display_name));
      changed := true;
    end if;
    audit_action := 'membership.approved';
  else
    if not member_exists or not target_member.active then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    if target_member.edit_version <> p_expected_version then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    if p_operation='change_role' and target_member.role=p_role then
      next_version := target_member.edit_version;
      next_role := target_member.role;
      next_active := true;
    else
      if target_member.role='administrator' and
        (p_operation='deactivate' or p_role<>'administrator') then
        select exists(select 1 from public.profiles p
          where p.auth_user_id=p_target_user_id and p.active)
          and private.has_eligible_identity_for(p_target_user_id)
          into target_eligible_admin;
        select pg_catalog.count(*) into admin_count
        from public.memberships m
        join public.profiles p on p.auth_user_id=m.user_id and p.active
        where m.active and m.role='administrator'
          and private.has_eligible_identity_for(m.user_id);
        if target_eligible_admin and admin_count <= 1 then
          return '{"ok":false,"code":"last_administrator"}'::jsonb;
        end if;
      end if;
      if p_operation='change_role' then
        update public.memberships set role=p_role,edit_version=edit_version+1
          where user_id=p_target_user_id
          returning edit_version,role,active into next_version,next_role,next_active;
      else
        update public.memberships set active=false,revoked_at=pg_catalog.now(),
          edit_version=edit_version+1 where user_id=p_target_user_id
          returning edit_version,role,active into next_version,next_role,next_active;
        update private.membership_invitations set removed_at=pg_catalog.now(),
          edit_version=edit_version+1
          where email=pg_catalog.lower(target_auth.email)
            and claimed_user_id is null and removed_at is null
          returning id into retired_invitation_id;
        if found then
          insert into public.audit_events(actor_user_id,action,resource_type,
            resource_id,correlation_id)
            values(actor,'membership.invitation_removed','membership',
              retired_invitation_id,p_request_id);
        end if;
      end if;
      changed := true;
    end if;
    audit_action := case when p_operation='change_role' then
      'membership.role_changed' else 'membership.deactivated' end;
  end if;

  result := pg_catalog.jsonb_build_object('ok',true,'targetUserId',p_target_user_id,
    'role',next_role,'active',next_active,'version',next_version,
    'changed',changed,'replayed',false);
  if changed then
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,audit_action,'membership',p_target_user_id,p_request_id);
  end if;
  insert into private.membership_write_receipts(
    actor_user_id,request_id,operation,target_user_id,payload_hash,result)
    values(actor,p_request_id,p_operation,p_target_user_id,fingerprint,result);
  return result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.invite_staff(p_request_id uuid, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); entry jsonb; mail text; wanted_role public.app_role;
  wanted_name text; inv private.membership_invitations%rowtype;
  old_receipt private.membership_write_receipts%rowtype; fingerprint text;
  added integer := 0; updated integer := 0; skipped jsonb := '[]'::jsonb;
  seen text[] := array[]::text[]; result jsonb;
begin
  if p_request_id is null or p_entries is null
    or pg_catalog.jsonb_typeof(p_entries) <> 'array'
    or pg_catalog.jsonb_array_length(p_entries) not between 1 and 200 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  for entry in select value from pg_catalog.jsonb_array_elements(p_entries) loop
    if pg_catalog.jsonb_typeof(entry) <> 'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(entry) k
        where k not in ('email','role','displayName'))
      or pg_catalog.jsonb_typeof(entry -> 'email') is distinct from 'string'
      or entry ->> 'role' is null
      or (entry ->> 'role') not in ('author','editor','administrator')
      or (entry ? 'displayName' and pg_catalog.jsonb_typeof(entry -> 'displayName')
        not in ('string','null')) then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
    mail := pg_catalog.lower(entry ->> 'email');
    wanted_name := entry ->> 'displayName';
    if mail !~ '^[^@[:space:]]+@bc[.]edu$' or pg_catalog.char_length(mail) > 255
      or mail = any(seen)
      or (wanted_name is not null and (
        wanted_name <> pg_catalog.btrim(wanted_name)
        or pg_catalog.char_length(wanted_name) not between 1 and 120
        or wanted_name ~ '[[:cntrl:]]'
        or private.has_unicode_format_character(wanted_name))) then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
    seen := seen || mail;
  end loop;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','invite','entries',(
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'email',pg_catalog.lower(e ->> 'email'),'role',e ->> 'role',
        'displayName',e -> 'displayName') order by pg_catalog.lower(e ->> 'email'))
      from pg_catalog.jsonb_array_elements(p_entries) e)));
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform u.id from auth.users u where u.id = actor for share;
  if not private.has_eligible_identity_for(actor) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into old_receipt from private.membership_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if old_receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb;
    end if;
    return pg_catalog.jsonb_set(old_receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=actor and active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  for entry in select value from pg_catalog.jsonb_array_elements(p_entries) loop
    mail := pg_catalog.lower(entry ->> 'email');
    wanted_role := (entry ->> 'role')::public.app_role;
    wanted_name := entry ->> 'displayName';
    -- People who already hold a membership are managed from their own row.
    if exists (select 1 from auth.users u join public.memberships m on m.user_id=u.id
      where pg_catalog.lower(u.email)=mail) then
      skipped := skipped || pg_catalog.to_jsonb(mail);
      continue;
    end if;
    select * into inv from private.membership_invitations
      where email=mail and claimed_user_id is null and removed_at is null for update;
    if found then
      if inv.role <> wanted_role
        or (wanted_name is not null and wanted_name is distinct from inv.display_name) then
        update private.membership_invitations
          set role=wanted_role,display_name=coalesce(wanted_name,display_name),
            edit_version=edit_version+1 where id=inv.id;
        insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
          values(actor,'membership.invitation_changed','membership',inv.id,p_request_id);
        updated := updated + 1;
      end if;
    else
      insert into private.membership_invitations(email,role,display_name,invited_by)
        values(mail,wanted_role,wanted_name,actor) returning * into inv;
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
        values(actor,'membership.invited','membership',inv.id,p_request_id);
      added := added + 1;
    end if;
  end loop;
  result := pg_catalog.jsonb_build_object('ok',true,'added',added,'updated',updated,
    'skipped',skipped,'replayed',false);
  insert into private.membership_write_receipts(
    actor_user_id,request_id,operation,target_user_id,payload_hash,result)
    values(actor,p_request_id,'invite',null,fingerprint,result);
  return result;
end;
$function$;


commit;
