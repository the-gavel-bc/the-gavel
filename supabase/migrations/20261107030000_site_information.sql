create table public.site_information (
  id uuid primary key default '00000000-0000-0000-0000-000000000002'::uuid
    check (id='00000000-0000-0000-0000-000000000002'::uuid),
  edit_version integer not null default 1 check (edit_version>0),
  mission text, contact_email text, instagram_url text, submission_instructions text
);
alter table public.site_information enable row level security;
revoke all on public.site_information from public,anon,authenticated;
insert into public.site_information default values;
create table private.site_information_receipts (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null, payload_hash text not null,
  result jsonb not null, primary key(actor_user_id,request_id)
);
revoke all on private.site_information_receipts from public,anon,authenticated;
-- Preserve allowlisted actions added by independently merged migrations.
do $$ declare previous_expression text; begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into strict previous_expression
    from pg_catalog.pg_constraint where conrelid='public.audit_events'::regclass
      and conname='audit_events_action_resource_check';
  alter table public.audit_events drop constraint audit_events_action_resource_check;
  execute pg_catalog.format('alter table public.audit_events add constraint audit_events_action_resource_check check ((%s) or (resource_type = %L and action = %L))',
    previous_expression,'site_information','site_information.updated');
end $$;
create function public.get_site_information()
returns table(edit_version integer,mission text,contact_email text,instagram_url text,submission_instructions text)
language sql stable security definer set search_path='' as $$
  select s.edit_version,s.mission,s.contact_email,s.instagram_url,s.submission_instructions
  from public.site_information s where private.is_active_administrator()
    and exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active);
$$;
create function public.save_site_information(p_expected_version integer,p_request_id uuid,
  p_mission text,p_contact_email text,p_instagram_url text,p_submission_instructions text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_row public.site_information%rowtype;
  receipt private.site_information_receipts%rowtype; fingerprint text; changed boolean; result jsonb;
begin
  if p_expected_version is null or p_expected_version<1 or p_request_id is null
    or (p_mission is not null and (char_length(p_mission) not between 1 and 5000
      or p_mission ~ '[<>]' or replace(replace(p_mission,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
    or (p_submission_instructions is not null and (char_length(p_submission_instructions) not between 1 and 5000
      or p_submission_instructions ~ '[<>]' or replace(replace(p_submission_instructions,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
    or (p_contact_email is not null and (char_length(p_contact_email)>254 or p_contact_email !~
      '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'))
    or (p_instagram_url is not null and (char_length(p_instagram_url)>255 or p_instagram_url !~
      '^https://(www\.)?instagram\.com/[A-Za-z0-9._/]+$'))
  then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=actor and p.active) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(pg_catalog.jsonb_build_object('operation','site_information.save',
    'version',p_expected_version,'mission',p_mission,'email',p_contact_email,
    'instagram',p_instagram_url,'instructions',p_submission_instructions));
  select * into receipt from private.site_information_receipts where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  select * into current_row from public.site_information where id='00000000-0000-0000-0000-000000000002'::uuid for update;
  if current_row.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  changed:=current_row.mission is distinct from p_mission or current_row.contact_email is distinct from p_contact_email
    or current_row.instagram_url is distinct from p_instagram_url or current_row.submission_instructions is distinct from p_submission_instructions;
  if changed and current_row.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if changed then
    update public.site_information set mission=p_mission,contact_email=p_contact_email,instagram_url=p_instagram_url,
      submission_instructions=p_submission_instructions,edit_version=edit_version+1
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
revoke all on function public.get_site_information(),public.save_site_information(integer,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.get_site_information(),public.save_site_information(integer,uuid,text,text,text,text) to authenticated;
