-- Reuse the established Google-only rule for session access, targets, counts
-- and trusted media; historical inline copies admitted mixed-provider users.
create function private.has_eligible_identity_for(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id=p_user_id and u.email_confirmed_at is not null
      and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
      and u.raw_app_meta_data ->> 'provider' = 'google'
      and (not (u.raw_app_meta_data ? 'providers')
        or (jsonb_typeof(u.raw_app_meta_data -> 'providers') = 'array'
          and u.raw_app_meta_data -> 'providers' <@ '["google"]'::jsonb))
  );
$$;
revoke all on function private.has_eligible_identity_for(uuid)
  from public,anon,authenticated,service_role;

create or replace function private.has_eligible_identity()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_eligible_identity_for(auth.uid());
$$;

create or replace function private.eligible_media_actor(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_eligible_identity_for(p_actor) and exists (
    select 1 from public.memberships m
    join public.profiles p on p.auth_user_id=m.user_id and p.active
    where m.user_id=p_actor and m.active
  );
$$;

create or replace function private.manage_membership(
  p_operation text,
  p_target_user_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_role public.app_role,
  p_display_name text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid();
  fingerprint text; old_receipt private.membership_write_receipts%rowtype;
  target_auth record; target_member public.memberships%rowtype;
  target_profile record; member_exists boolean; profile_exists boolean;
  target_eligible_admin boolean; changed boolean := false;
  next_version integer; next_role public.app_role; next_active boolean;
  audit_action text; result jsonb; admin_count integer;
begin
  if p_operation not in ('approve','change_role','deactivate')
    or p_target_user_id is null or p_request_id is null
    or (p_operation = 'approve' and (
      p_role is null or p_display_name is null
      or p_display_name <> pg_catalog.btrim(p_display_name)
      or pg_catalog.char_length(p_display_name) not between 1 and 120
      or p_display_name ~ '[[:cntrl:]]'
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
        (p_operation='deactivate' or p_role='author') then
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
          return '{"ok":false,"code":"conflict"}'::jsonb;
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
$$;
revoke all on function private.manage_membership(text,uuid,integer,uuid,public.app_role,text)
from public,anon,authenticated;
