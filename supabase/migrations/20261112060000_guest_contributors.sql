-- Credits identify public people; creating a guest never creates login access.
alter table private.profile_write_receipts drop constraint profile_write_receipts_operation_check;
alter table private.profile_write_receipts add constraint profile_write_receipts_operation_check
  check (operation in ('create','save','deactivate','save_own','create_guest_author'));

create function public.search_contributors(p_query text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare items jsonb;
begin
  if private.lock_draft_actor() is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_query is null or char_length(p_query) not between 1 and 120 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'slug',p.slug)
    order by p.display_name,p.id),'[]'::jsonb) into items from (
      select id,display_name,slug from public.profiles
      where active and position(lower(p_query) in lower(display_name))>0
      order by display_name,id limit 10
    ) p;
  return jsonb_build_object('ok',true,'items',items);
end;
$$;

create function public.create_guest_contributor(p_request_id uuid,p_display_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fingerprint text; profile public.profiles%rowtype;
  receipt private.profile_write_receipts%rowtype; result jsonb; next_slug text;
  created boolean:=false;
begin
  if p_request_id is null or p_display_name is null
    or p_display_name<>btrim(p_display_name) or char_length(p_display_name) not between 1 and 120
    or p_display_name ~ '[[:cntrl:]]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  -- Match administrator/own-profile global-lock order before taking actor rows.
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
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  -- Include login-linked people in reuse: a credit does not grant their access.
  select * into profile from public.profiles where active and lower(display_name)=lower(p_display_name)
    order by id limit 1;
  if not found then
    next_slug:=private.allocate_profile_slug(p_display_name,null::uuid);
    if next_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
    insert into public.profiles(display_name,slug) values(p_display_name,next_slug) returning * into profile;
    created:=true;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'profile.created','profile',profile.id,p_request_id);
  end if;
  result:=jsonb_build_object('ok',true,'id',profile.id,'displayName',profile.display_name,
    'slug',profile.slug,'created',created,'replayed',false);
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    values(actor,p_request_id,'create_guest_author',profile.id,fingerprint,result);
  return result;
end;
$$;
revoke all on function public.search_contributors(text),public.create_guest_contributor(uuid,text)
  from public,anon,authenticated;
grant execute on function public.search_contributors(text),public.create_guest_contributor(uuid,text)
  to authenticated;
