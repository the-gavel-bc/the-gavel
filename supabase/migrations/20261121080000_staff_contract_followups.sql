-- Require an existing membership for approve/reactivate and enforce invitation states.
begin;
set local lock_timeout = '5s';

do $$
declare invalid_count bigint;
begin
  select pg_catalog.count(*) into invalid_count
  from private.membership_invitations
  where (claimed_user_id is null) <> (claimed_at is null)
    or (claimed_user_id is not null and removed_at is not null);
  if invalid_count > 0 then
    raise exception 'Cannot validate invitation state invariant: % conflicting rows.',
      invalid_count;
  end if;
end;
$$;

alter table private.membership_invitations
  add constraint membership_invitations_state_check check (
    ((claimed_user_id is null) = (claimed_at is null))
    and (claimed_user_id is null or removed_at is null)
  ) not valid;
alter table private.membership_invitations
  validate constraint membership_invitations_state_check;

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
  if p_operation='approve' and p_expected_version is null then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
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
      return '{"ok":false,"code":"not_found"}'::jsonb;
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
commit;
