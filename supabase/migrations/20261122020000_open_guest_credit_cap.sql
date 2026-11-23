-- Limit new one-off creation without touching existing profiles or receipts.
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
  -- The actor lock and shared profile locks serialize new credits for this member.
  -- A later detach can leave an older member over cap, so check creation only.
  if (select count(*) from (
    select 1 from private.profile_write_receipts r
    join public.profiles guest on guest.id=r.profile_id and guest.auth_user_id is null
    where r.actor_user_id=actor and r.operation='create_guest_author'
      and r.result @> '{"created":true}'::jsonb
      and not exists(select 1 from public.article_contributors c where c.profile_id=guest.id)
    limit 50
  ) open_credits)>=50 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
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
