-- Keep JSON role validation tied to the database enum used by memberships.
begin;

create or replace function private.is_app_role(p_value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select exists (select 1 from pg_catalog.unnest(
    pg_catalog.enum_range(null::public.app_role)) as roles(role)
    where role::text = p_value);
$$;
revoke all on function private.is_app_role(text) from public,anon,authenticated;

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
      or not private.is_app_role(entry ->> 'role')
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
      else
        skipped := skipped || pg_catalog.to_jsonb(mail);
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

CREATE OR REPLACE FUNCTION public.list_staff(p_limit integer DEFAULT 21, p_search text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_state text DEFAULT 'all'::text, p_after_email text DEFAULT NULL::text, p_after_key text DEFAULT NULL::text)
 RETURNS TABLE(key text, user_id uuid, invitation_id uuid, email text, display_name text, role app_role, state text, edit_version integer, eligible boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pattern text;
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or p_state is null or p_state not in ('all','active','inactive','invited')
    or (p_role is not null and not private.is_app_role(p_role))
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
$function$;
commit;
