-- Add role context to staff audit history without rewriting existing rows.
begin;
set local lock_timeout = '5s';

alter table public.audit_events add column detail jsonb;
alter table public.audit_events add constraint audit_events_detail_object_check
  check (detail is null or pg_catalog.jsonb_typeof(detail) = 'object') not valid;
alter table public.audit_events validate constraint audit_events_detail_object_check;

alter table public.audit_events drop constraint audit_events_action_resource_check;
alter table public.audit_events add constraint audit_events_action_resource_check check (
  (resource_type = 'article' and action in ('article.created','article.updated','article.published',
    'article.archived','article.restored','article.deleted','article.owner_changed',
    'article.submitted','article.returned','article.image_purged'))
  or (resource_type = 'membership' and action in ('membership.approved','membership.role_changed',
    'membership.deactivated','membership.invited','membership.invitation_changed',
    'membership.invitation_removed','membership.claimed','membership.reactivated'))
  or (resource_type = 'profile' and action in ('profile.created','profile.updated','profile.deactivated'))
  or (resource_type = 'section' and action in ('section.updated','section.created','section.deleted'))
  or (resource_type = 'category' and action in ('category.updated','category.created','category.deleted'))
  or (resource_type = 'homepage' and action = 'homepage.updated')
  or (resource_type = 'site_information' and action = 'site_information.updated')
  or (resource_type = 'tag' and action in ('tag.renamed','tag.merged','tag.deleted'))
 ) not valid;
alter table public.audit_events validate constraint audit_events_action_resource_check;

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
  retired_invitation_role public.app_role;
  audit_action text; audit_detail jsonb; result jsonb; admin_count integer; retired_invitation_id uuid;
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
    audit_action := case when member_exists and not target_member.active
      then 'membership.reactivated' else 'membership.approved' end;
    audit_detail := pg_catalog.jsonb_build_object(
      'previousRole',case when member_exists and not target_member.active
        then target_member.role::text else null end,'newRole',p_role::text);
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
          returning id,role into retired_invitation_id,retired_invitation_role;
        if found then
          insert into public.audit_events(actor_user_id,action,resource_type,
            resource_id,correlation_id,detail)
            values(actor,'membership.invitation_removed','membership',
              retired_invitation_id,p_request_id,
              pg_catalog.jsonb_build_object('role',retired_invitation_role::text));
        end if;
      end if;
      changed := true;
    end if;
    audit_action := case when p_operation='change_role' then
      'membership.role_changed' else 'membership.deactivated' end;
    audit_detail := case when p_operation='change_role' then
      pg_catalog.jsonb_build_object('previousRole',target_member.role::text,
        'newRole',next_role::text)
      else pg_catalog.jsonb_build_object('role',target_member.role::text) end;
  end if;

  result := pg_catalog.jsonb_build_object('ok',true,'targetUserId',p_target_user_id,
    'role',next_role,'active',next_active,'version',next_version,
    'changed',changed,'replayed',false);
  if changed then
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id,detail)
      values(actor,audit_action,'membership',p_target_user_id,p_request_id,audit_detail);
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
        insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id,detail)
          values(actor,'membership.invitation_changed','membership',inv.id,p_request_id,
            pg_catalog.jsonb_build_object('previousRole',inv.role::text,'newRole',wanted_role::text));
        updated := updated + 1;
      end if;
    else
      insert into private.membership_invitations(email,role,display_name,invited_by)
        values(mail,wanted_role,wanted_name,actor) returning * into inv;
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id,detail)
        values(actor,'membership.invited','membership',inv.id,p_request_id,
          pg_catalog.jsonb_build_object('role',wanted_role::text));
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

create or replace function private.manage_invitation(
  p_operation text, p_invitation_id uuid, p_expected_version integer,
  p_request_id uuid, p_role public.app_role
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text; inv private.membership_invitations%rowtype;
  old_receipt private.membership_write_receipts%rowtype; result jsonb; previous_role public.app_role;
begin
  if p_operation not in ('change_invitation','remove_invitation')
    or p_invitation_id is null or p_request_id is null
    or p_expected_version is null or p_expected_version < 1
    or (p_operation = 'change_invitation' and p_role is null)
    or (p_operation = 'remove_invitation' and p_role is not null) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation',p_operation,'invitation',p_invitation_id,
    'expectedVersion',p_expected_version,'role',p_role));
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
  select * into inv from private.membership_invitations where id=p_invitation_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  -- Already claimed, removed or edited elsewhere: the person must refresh.
  if inv.claimed_user_id is not null or inv.removed_at is not null
    or inv.edit_version <> p_expected_version then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  previous_role := inv.role;
  if p_operation = 'change_invitation' then
    update private.membership_invitations
      set role=p_role,edit_version=edit_version+1 where id=inv.id
      returning * into inv;
  else
    update private.membership_invitations set removed_at=pg_catalog.now(),
      edit_version=edit_version+1 where id=inv.id returning * into inv;
  end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id,detail)
    values(actor,case when p_operation='change_invitation'
      then 'membership.invitation_changed' else 'membership.invitation_removed' end,
      'membership',inv.id,p_request_id,case when p_operation='change_invitation' then
        pg_catalog.jsonb_build_object('previousRole',
          previous_role::text,
          'newRole',inv.role::text)
        else pg_catalog.jsonb_build_object('role',inv.role::text) end);
  result := pg_catalog.jsonb_build_object('ok',true,'invitationId',inv.id,
    'role',inv.role,'version',inv.edit_version,'replayed',false);
  insert into private.membership_write_receipts(
    actor_user_id,request_id,operation,target_user_id,payload_hash,result)
    values(actor,p_request_id,p_operation,null,fingerprint,result);
  return result;
end;
$$;

create or replace function public.claim_invitation()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text; google_name text; chosen text;
  inv private.membership_invitations%rowtype; mem public.memberships%rowtype;
  prof record; actual_role public.app_role;
begin
  if uid is null or not private.has_eligible_identity() then return false; end if;
  select pg_catalog.lower(u.email) into mail from auth.users u where u.id=uid;
  -- Cheap check first so ordinary visits never take the membership lock.
  if not exists (select 1 from private.membership_invitations
    where email=mail and claimed_user_id is null and removed_at is null) then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  select u.raw_user_meta_data ->> 'full_name' into google_name
    from auth.users u where u.id=uid for share;
  select * into inv from private.membership_invitations
    where email=mail and claimed_user_id is null and removed_at is null for update;
  if not found then return false; end if;
  chosen := pg_catalog.btrim(pg_catalog.regexp_replace(
    coalesce(inv.display_name,google_name,''),'[[:cntrl:]]','','g'));
  chosen := pg_catalog.left(chosen,120);
  if chosen = '' then chosen := pg_catalog.split_part(mail,'@',1); end if;
  select * into mem from public.memberships where user_id=uid for update;
  if found then
    if not mem.active then
      update public.memberships set active=true,role=inv.role,
        approved_by=inv.invited_by,approved_at=pg_catalog.now(),revoked_at=null,
        edit_version=edit_version+1 where user_id=uid;
    end if;
  else
    insert into public.memberships(user_id,role,active,approved_by,approved_at)
      values(uid,inv.role,true,inv.invited_by,pg_catalog.now());
  end if;
  select role into actual_role from public.memberships where user_id=uid;
  select id,active into prof from public.profiles where auth_user_id=uid for update;
  if not found then
    insert into public.profiles(auth_user_id,display_name,slug)
      values(uid,chosen,private.allocate_profile_slug(chosen));
  elsif not prof.active then
    -- Same rule as approval: a deactivated profile needs an administrator.
    raise exception 'Inactive profile.' using errcode='P0001';
  end if;
  update private.membership_invitations
    set claimed_user_id=uid,claimed_at=pg_catalog.now() where id=inv.id;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,detail)
    values(uid,'membership.claimed','membership',uid,
      pg_catalog.jsonb_build_object('role',actual_role::text));
  return true;
end;
$$;

create function public.list_membership_audit_events_v2(
  p_limit integer default 21, p_before_at timestamptz default null,
  p_before_id uuid default null, p_subject uuid default null
) returns table (
  event_id uuid, action text, resource_id uuid, created_at timestamptz,
  actor_label text, target_email text, detail jsonb
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active
  ) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid audit request.' using errcode='22023';
  end if;
  return query
  select e.id,e.action,e.resource_id,e.created_at,
    coalesce(actor_profile.display_name,'Former member')::text,
    coalesce(target_user.email,listing.email,'')::text,e.detail
  from public.audit_events e
  left join public.profiles actor_profile on actor_profile.auth_user_id=e.actor_user_id
  left join auth.users target_user on target_user.id=e.resource_id
  left join private.membership_invitations listing on listing.id=e.resource_id
  where e.resource_type='membership'
    and e.action in ('membership.approved','membership.role_changed',
      'membership.deactivated','membership.invited','membership.invitation_changed',
      'membership.invitation_removed','membership.claimed','membership.reactivated')
    and (p_subject is null or e.resource_id = p_subject
      or e.resource_id in (select i.id from private.membership_invitations i
        where i.id = p_subject or i.claimed_user_id = p_subject
          or i.email = (select pg_catalog.lower(u.email) from auth.users u
            where u.id = p_subject)))
    and (p_before_at is null or (e.created_at,e.id) < (p_before_at,p_before_id))
  order by e.created_at desc,e.id desc
  limit p_limit;
end;
$$;
revoke all on function public.list_membership_audit_events_v2(integer,timestamptz,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.list_membership_audit_events_v2(integer,timestamptz,uuid,uuid)
  to authenticated;
commit;
