-- Track retained historical associations by the contributor portion of each snapshot.
create index article_revisions_contributors_lookup_idx on public.article_revisions
  using gin ((snapshot->'contributors') jsonb_path_ops);
create table private.guest_credit_provenance (
  profile_id uuid primary key references public.profiles(id) on delete cascade
);
alter table private.guest_credit_provenance enable row level security;
revoke all on table private.guest_credit_provenance from public,anon,authenticated,service_role;

-- Keep the non-personal proof of creation independently of actor receipts.
insert into private.guest_credit_provenance(profile_id)
select distinct p.id from private.profile_write_receipts r
join public.profiles p on p.id=r.profile_id and p.auth_user_id is null
where r.operation='create_guest_author' and r.result @> '{"created":true}';

create index profiles_orphan_candidates_idx on public.profiles(created_at,id)
  where auth_user_id is null and not slug_frozen;

create function private.is_orphan_guest_credit(p_profile public.profiles,p_cutoff timestamptz)
returns boolean language sql stable set search_path='' as $$
  select p_profile.auth_user_id is null and not p_profile.slug_frozen and p_profile.created_at<p_cutoff
    and exists(select 1 from private.guest_credit_provenance g where g.profile_id=p_profile.id)
    and not exists(select 1 from public.article_contributors c where c.profile_id=p_profile.id)
    and not exists(select 1 from public.articles a where a.owner_profile_id=p_profile.id)
    and not exists(select 1 from public.articles a where a.published_by_profile_id=p_profile.id)
    and not exists(select 1 from private.profile_photos ph where ph.profile_id=p_profile.id)
    and not exists(select 1 from public.article_revisions rev where rev.snapshot->'contributors' @>
      jsonb_build_array(jsonb_build_object('profileId',p_profile.id)));
$$;
revoke all on function private.is_orphan_guest_credit(public.profiles,timestamptz)
  from public,anon,authenticated,service_role;

create function public.sweep_orphan_guest_credits(p_limit integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare cutoff timestamptz:=statement_timestamp()-interval '30 days'; candidates uuid[]; removed integer;
begin
  if p_limit is null or p_limit not between 1 and 100 then return '{"ok":false}'::jsonb; end if;
  -- Match guest creation and moderation lock order. A simultaneous run can retry.
  if not pg_catalog.pg_try_advisory_xact_lock(72300320261107::bigint)
    or not pg_catalog.pg_try_advisory_xact_lock(72300320261106::bigint) then
    return '{"ok":true,"deleted":0,"busy":true}'::jsonb;
  end if;
  select array_agg(c.id) into candidates from (
    select p.id from public.profiles p
    where p.auth_user_id is null and not p.slug_frozen and p.created_at<cutoff
      and private.is_orphan_guest_credit(p,cutoff)
    order by p.created_at,p.id limit p_limit for update of p skip locked
  ) c;
  -- A draft can have acquired a shared profile lock or retained a revision just
  -- before our candidate statement. Recheck in a new statement with locks held.
  delete from public.profiles p where p.id=any(candidates) and private.is_orphan_guest_credit(p,cutoff);
  get diagnostics removed=row_count;
  return jsonb_build_object('ok',true,'deleted',removed,'busy',false);
end;
$$;
revoke all on function public.sweep_orphan_guest_credits(integer) from public,anon,authenticated,service_role;
grant execute on function public.sweep_orphan_guest_credits(integer) to service_role;

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
    if not exists(select 1 from public.profiles p where p.id=receipt.profile_id) then
      return '{"ok":false,"code":"expired"}'::jsonb;
    end if;
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
  insert into private.guest_credit_provenance(profile_id) values(profile.id);
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,'profile.created','profile',profile.id,p_request_id);
  result:=jsonb_build_object('ok',true,'id',profile.id,'displayName',profile.display_name,
    'slug',profile.slug,'created',true,'replayed',false);
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    values(actor,p_request_id,'create_guest_author',profile.id,fingerprint,result);
  return result;
end;
$$;
