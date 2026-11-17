-- Staff access comes from an administrator's email list. Nobody is stored
-- until they are listed or sign in as a listed person, so there is no pending
-- queue. A listed address becomes a membership at the person's first eligible
-- sign-in (claim_invitation).
create table private.membership_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    email = pg_catalog.lower(email) and pg_catalog.char_length(email) <= 255
    and email ~ '^[^@[:space:]]+@bc[.]edu$'),
  role public.app_role not null,
  display_name text check (display_name is null or (
    display_name = pg_catalog.btrim(display_name)
    and pg_catalog.char_length(display_name) between 1 and 120
    and display_name !~ '[[:cntrl:]]')),
  edit_version integer not null default 1 check (edit_version > 0),
  invited_by uuid not null references auth.users(id) on update restrict on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  claimed_user_id uuid references auth.users(id) on update restrict on delete restrict,
  claimed_at timestamptz,
  removed_at timestamptz
);
-- One live (unclaimed, unremoved) listing per address.
create unique index membership_invitations_live_email_idx
  on private.membership_invitations(email)
  where claimed_user_id is null and removed_at is null;
revoke all on table private.membership_invitations from public, anon, authenticated;

alter table private.membership_write_receipts
  drop constraint membership_write_receipts_operation_check,
  alter column target_user_id drop not null,
  add constraint membership_write_receipts_operation_check check (operation in (
    'approve','change_role','deactivate','invite','change_invitation','remove_invitation'));

do $$ declare previous_expression text; begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into strict previous_expression
    from pg_catalog.pg_constraint where conrelid='public.audit_events'::regclass
      and conname='audit_events_action_resource_check';
  alter table public.audit_events drop constraint audit_events_action_resource_check;
  execute pg_catalog.format('alter table public.audit_events add constraint audit_events_action_resource_check check ((%s) or (resource_type = %L and action in (%L,%L,%L,%L)))',
    previous_expression,'membership','membership.invited',
    'membership.invitation_changed','membership.invitation_removed','membership.claimed');
end $$;

-- Add or update listed people in bulk (up to 200 entries per request).
create function public.invite_staff(p_request_id uuid, p_entries jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); entry jsonb; mail text; wanted_role public.app_role;
  wanted_name text; inv private.membership_invitations%rowtype;
  old_receipt private.membership_write_receipts%rowtype; fingerprint text;
  added integer := 0; updated integer := 0; skipped jsonb := '[]'::jsonb;
  seen text[] := '{}'; result jsonb; key text;
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
      or (entry ->> 'role') not in ('author','administrator')
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
        or wanted_name ~ '[[:cntrl:]]')) then
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
$$;

-- Change the role of, or remove, a listed person who has not signed in yet.
create function private.manage_invitation(
  p_operation text, p_invitation_id uuid, p_expected_version integer,
  p_request_id uuid, p_role public.app_role
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text; inv private.membership_invitations%rowtype;
  old_receipt private.membership_write_receipts%rowtype; result jsonb;
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
  if p_operation = 'change_invitation' then
    update private.membership_invitations
      set role=p_role,edit_version=edit_version+1 where id=inv.id
      returning * into inv;
  else
    update private.membership_invitations set removed_at=pg_catalog.now(),
      edit_version=edit_version+1 where id=inv.id returning * into inv;
  end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,case when p_operation='change_invitation'
      then 'membership.invitation_changed' else 'membership.invitation_removed' end,
      'membership',inv.id,p_request_id);
  result := pg_catalog.jsonb_build_object('ok',true,'invitationId',inv.id,
    'role',inv.role,'version',inv.edit_version,'replayed',false);
  insert into private.membership_write_receipts(
    actor_user_id,request_id,operation,target_user_id,payload_hash,result)
    values(actor,p_request_id,p_operation,null,fingerprint,result);
  return result;
end;
$$;
revoke all on function private.manage_invitation(text,uuid,integer,uuid,public.app_role)
  from public, anon, authenticated;
create function public.change_invitation_role(
  p_invitation_id uuid, p_expected_version integer, p_request_id uuid,
  p_role public.app_role
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.manage_invitation('change_invitation',p_invitation_id,
    p_expected_version,p_request_id,p_role);
$$;
create function public.remove_invitation(
  p_invitation_id uuid, p_expected_version integer, p_request_id uuid
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.manage_invitation('remove_invitation',p_invitation_id,
    p_expected_version,p_request_id,null);
$$;

-- Called with the signed-in person's own session. Turns a matching listing
-- into a membership and profile; returns false when there is nothing to claim.
create function public.claim_invitation()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text; google_name text; chosen text;
  inv private.membership_invitations%rowtype; mem public.memberships%rowtype;
  prof record;
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
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id)
    values(uid,'membership.claimed','membership',uid);
  return true;
end;
$$;

-- People directory: members and listed (not yet signed in) people together.
create function public.list_staff(
  p_limit integer default 21, p_search text default null,
  p_role text default null, p_state text default 'all',
  p_after_email text default null, p_after_key text default null
) returns table (
  key text, user_id uuid, invitation_id uuid, email text, display_name text,
  role public.app_role, state text, edit_version integer, eligible boolean
) language plpgsql stable security definer set search_path = '' as $$
declare pattern text;
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or p_state is null or p_state not in ('all','active','inactive','invited')
    or (p_role is not null and p_role not in ('author','administrator'))
    or (p_search is not null and pg_catalog.char_length(p_search) > 100)
    or ((p_after_email is null) <> (p_after_key is null))
    or (p_after_email is not null and (
      pg_catalog.char_length(p_after_email) > 255
      or p_after_email <> pg_catalog.lower(p_after_email)
      or pg_catalog.char_length(p_after_key) > 64)) then
    raise exception 'Invalid membership list request.' using errcode='22023';
  end if;
  pattern := case when pg_catalog.btrim(coalesce(p_search,'')) = '' then null
    else '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
      pg_catalog.btrim(p_search),'\','\\'),'%','\%'),'_','\_') || '%' end;
  return query
  with people as (
    select m.user_id::text as k,m.user_id as uid,null::uuid as iid,
      coalesce(pg_catalog.lower(u.email),'')::text as mail,
      p.display_name as dn,m.role as r,
      (case when m.active then 'active' else 'inactive' end)::text as st,
      m.edit_version as ev,private.has_eligible_identity_for(m.user_id) as ok
    from public.memberships m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.auth_user_id=m.user_id
    union all
    select i.id::text,null::uuid,i.id,i.email,i.display_name,i.role,'invited',
      i.edit_version,true
    from private.membership_invitations i
    where i.claimed_user_id is null and i.removed_at is null
  )
  select x.k,x.uid,x.iid,x.mail,x.dn,x.r,x.st,x.ev,x.ok from people x
  where (p_state='all' or x.st=p_state)
    and (p_role is null or x.r::text=p_role)
    and (pattern is null or x.mail ilike pattern escape '\'
      or coalesce(x.dn,'') ilike pattern escape '\')
    and (p_after_email is null or
      (x.mail collate "C",x.k collate "C") > (p_after_email collate "C",p_after_key collate "C"))
  order by x.mail collate "C",x.k collate "C"
  limit p_limit;
end;
$$;

create function public.staff_summary()
returns table (administrators integer, authors integer, invited integer, inactive integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  return query select
    (select pg_catalog.count(*) from public.memberships where active and role='administrator')::integer,
    (select pg_catalog.count(*) from public.memberships where active and role='author')::integer,
    (select pg_catalog.count(*) from private.membership_invitations
      where claimed_user_id is null and removed_at is null)::integer,
    (select pg_catalog.count(*) from public.memberships where not active)::integer;
end;
$$;

-- The audit page now also reads listing events (their resource is the listing).
create or replace function public.list_membership_audit_events(
  p_limit integer default 21, p_before_at timestamptz default null,
  p_before_id uuid default null
) returns table (
  event_id uuid, action text, resource_id uuid, created_at timestamptz,
  actor_label text, target_email text
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
    coalesce(target_user.email,listing.email,'')::text
  from public.audit_events e
  left join public.profiles actor_profile on actor_profile.auth_user_id=e.actor_user_id
  left join auth.users target_user on target_user.id=e.resource_id
  left join private.membership_invitations listing on listing.id=e.resource_id
  where e.resource_type='membership'
    and e.action in ('membership.approved','membership.role_changed',
      'membership.deactivated','membership.invited','membership.invitation_changed',
      'membership.invitation_removed','membership.claimed')
    and (p_before_at is null or (e.created_at,e.id) < (p_before_at,p_before_id))
  order by e.created_at desc,e.id desc
  limit p_limit;
end;
$$;

-- Approval queue retired: the old candidates directory is replaced by list_staff.
drop function public.list_membership_candidates(integer,text,text,uuid);

revoke all on function public.invite_staff(uuid,jsonb),
  public.change_invitation_role(uuid,integer,uuid,public.app_role),
  public.remove_invitation(uuid,integer,uuid), public.claim_invitation(),
  public.list_staff(integer,text,text,text,text,text), public.staff_summary()
  from public, anon, authenticated;
grant execute on function public.invite_staff(uuid,jsonb),
  public.change_invitation_role(uuid,integer,uuid,public.app_role),
  public.remove_invitation(uuid,integer,uuid), public.claim_invitation(),
  public.list_staff(integer,text,text,text,text,text), public.staff_summary()
  to authenticated;
