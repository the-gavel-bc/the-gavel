-- Media review hardening: expiry correctness, unfinished-upload reaping, profile
-- photo safety, one asset rule, stricter authority, administrator purge.
-- Plans: docs/code-reviews/plans. Decisions: docs/code-reviews/plans/README.md.

-- Defense in depth: no application role may read photo bytes directly.
alter table private.profile_photos enable row level security;

-- article_authority deliberately does not check Auth eligibility: every caller
-- (lock_draft_actor, lock_media_actor, can_read_article) already does, and doing
-- it here too would turn an ineligible identity's clear "forbidden" into
-- "not_found". Callers must keep that precondition; the authority scan test
-- (069) fails if an application-callable function stops using these guards.
comment on function private.article_authority(uuid, uuid, text) is
  'Precondition: the caller has proven the Auth identity is eligible and the actor is locked.';

-- The single rule for who may continue an upload reservation: its uploader, or
-- an administrator. (Article access is checked separately by article_authority.)
create function private.can_use_asset(p_asset_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.media_assets a
    where a.id = p_asset_id and (a.uploader_user_id = p_user_id
      or exists (select 1 from public.memberships m
        where m.user_id = p_user_id and m.active and m.role = 'administrator'))
  );
$$;
revoke all on function private.can_use_asset(uuid, uuid) from public, anon, authenticated;

-- A real WebP container: RIFF size matches the length and the first chunk is a
-- known VP8 variant.
create function private.is_valid_webp(p_bytes bytea)
returns boolean language sql immutable set search_path = '' as $$
  select p_bytes is not null and pg_catalog.octet_length(p_bytes) >= 20
    and pg_catalog.substr(p_bytes, 1, 4) = '\x52494646'::bytea
    and pg_catalog.substr(p_bytes, 9, 4) = '\x57454250'::bytea
    and pg_catalog.get_byte(p_bytes, 4) + 256 * pg_catalog.get_byte(p_bytes, 5)
      + 65536 * pg_catalog.get_byte(p_bytes, 6) + 16777216 * pg_catalog.get_byte(p_bytes, 7)
      = pg_catalog.octet_length(p_bytes) - 8
    and pg_catalog.substr(p_bytes, 13, 4) in ('\x56503820'::bytea, '\x5650384c'::bytea, '\x56503858'::bytea);
$$;
revoke all on function private.is_valid_webp(bytea) from public, anon, authenticated;

-- Profile photos: rate limited, strictly validated, and only for active members.
create or replace function public.set_own_profile_photo(p_bytes bytea)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_id uuid; stamp timestamptz;
begin
  if p_bytes is null or pg_catalog.octet_length(p_bytes) not between 1 and 524288
    or not private.is_valid_webp(p_bytes) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  target_id := private.lock_draft_actor();
  if actor is null or target_id is null then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  if not private.consume_draft_attempt(actor) then
    return '{"ok":false,"code":"rate_limited"}'::jsonb;
  end if;
  stamp := pg_catalog.clock_timestamp();
  insert into private.profile_photos(profile_id,bytes,updated_at)
    values(target_id,p_bytes,stamp)
    on conflict (profile_id) do update set bytes=excluded.bytes,updated_at=excluded.updated_at;
  update public.profiles set photo_updated_at=stamp where id=target_id;
  return pg_catalog.jsonb_build_object('ok',true,'updatedAt',stamp);
end;
$$;

create or replace function public.get_public_profile_photo(p_slug text)
returns table(bytes bytea, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ph.bytes, ph.updated_at from public.profiles p
    join private.profile_photos ph on ph.profile_id = p.id
    join public.memberships m on m.user_id = p.auth_user_id and m.active
    where p.slug = p_slug and p.active and p.auth_user_id is not null;
$$;

create function public.admin_remove_profile_photo(p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_profile_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if not private.is_active_administrator() then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  delete from private.profile_photos where profile_id = p_profile_id;
  update public.profiles set photo_updated_at = null where id = p_profile_id;
  return '{"ok":true}'::jsonb;
end;
$$;
revoke all on function public.admin_remove_profile_photo(uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_profile_photo(uuid) to authenticated;

-- Expiry: only draft and published articles' rows are candidates, failed rows
-- rotate to the back, and unfinished uploads are reaped after a day.
alter table public.media_assets add column expiry_attempted_at timestamptz;

create or replace function public.claim_expired_unused_uploads(p_older_than interval default '7 days', p_limit integer default 25)
returns table(asset_id uuid, object_key text)
language plpgsql security definer set search_path = '' as $$
declare cand record; a public.media_assets%rowtype; ar public.articles%rowtype;
  claimed integer := 0; unfinished interval := least(p_older_than, interval '1 day');
begin
  if p_older_than is null or p_older_than < interval '1 day'
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid expiry request.' using errcode = '22023';
  end if;
  for cand in
    select m.id, m.article_id from public.media_assets m
    join public.articles x on x.id = m.article_id and x.status in ('draft','published')
    where ((m.status in ('finalized','deleting')
        and coalesce(m.finalized_at, m.created_at) < pg_catalog.now() - p_older_than)
      or (m.status in ('pending','uploading') and m.created_at < pg_catalog.now() - unfinished))
      and (m.expiry_attempted_at is null or m.expiry_attempted_at < pg_catalog.now() - interval '1 hour')
      and not private.media_asset_in_use(m.id)
    order by m.expiry_attempted_at nulls first, m.created_at, m.id
    limit p_limit * 4
  loop
    exit when claimed >= p_limit;
    -- Same order as manual removal: article first, then the image. A row an
    -- editor or save holds is left for the next run.
    select * into ar from public.articles where id = cand.article_id for update skip locked;
    continue when not found or ar.status not in ('draft','published');
    select * into a from public.media_assets where id = cand.id for update skip locked;
    continue when not found
      or a.status not in ('finalized','deleting','pending','uploading')
      or (a.status in ('finalized','deleting')
        and coalesce(a.finalized_at, a.created_at) >= pg_catalog.now() - p_older_than)
      or (a.status in ('pending','uploading') and a.created_at >= pg_catalog.now() - unfinished)
      or private.media_asset_in_use(a.id);
    update public.media_assets
      set status = 'deleting', expiry_attempted_at = pg_catalog.now() where id = a.id;
    asset_id := a.id; object_key := a.object_key; claimed := claimed + 1;
    return next;
  end loop;
end;
$$;

create or replace function public.complete_expired_unused_upload(p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.media_assets%rowtype; ar public.articles%rowtype;
begin
  select * into a from public.media_assets where id = p_asset_id;
  if not found then return '{"ok":true,"replayed":true}'::jsonb; end if;
  select * into ar from public.articles where id = a.article_id for update;
  select * into a from public.media_assets where id = p_asset_id for update;
  if not found then return '{"ok":true,"replayed":true}'::jsonb; end if;
  if a.status <> 'deleting' or private.media_asset_in_use(a.id)
    or ar.status not in ('draft','published') then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  -- Storage deletion must have happened first.
  if exists (select 1 from storage.objects where bucket_id = 'article-media' and name = a.object_key) then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  delete from public.media_assets where id = p_asset_id;
  return '{"ok":true,"replayed":false}'::jsonb;
end;
$$;
drop table private.media_expiry_log;

-- Cleanup ledger: index the claim ordering.
create index media_cleanup_ledger_claim_idx on private.media_cleanup_ledger
  ((last_succeeded is false) desc, last_attempt_at nulls first, object_key);

-- Administrator takedown of an image that only history still references.
alter table public.audit_events drop constraint audit_events_action_resource_check;
alter table public.audit_events add constraint audit_events_action_resource_check check (
  (resource_type = 'article' and action in ('article.created','article.updated','article.published',
    'article.archived','article.restored','article.deleted','article.owner_changed',
    'article.submitted','article.returned','article.image_purged'))
  or (resource_type = 'membership' and action in ('membership.approved','membership.role_changed',
    'membership.deactivated','membership.invited','membership.invitation_changed',
    'membership.invitation_removed','membership.claimed'))
  or (resource_type = 'profile' and action in ('profile.created','profile.updated','profile.deactivated'))
  or (resource_type = 'section' and action in ('section.updated','section.created','section.deleted'))
  or (resource_type = 'category' and action in ('category.updated','category.created','category.deleted'))
  or (resource_type = 'homepage' and action = 'homepage.updated')
  or (resource_type = 'site_information' and action = 'site_information.updated')
  or (resource_type = 'tag' and action in ('tag.renamed','tag.merged','tag.deleted'))
);

-- Removes an image from every retained revision so the daily expiry job can
-- delete it. Refused while the image is attached to the article. The asset is
-- hidden from readers immediately (status deleting).
create function public.purge_article_image(p_article_id uuid, p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); asset public.media_assets%rowtype; article public.articles%rowtype;
begin
  if p_article_id is null or p_asset_id is null then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if private.lock_draft_actor() is null or not private.is_active_administrator() then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id = p_article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into asset from public.media_assets where id = p_asset_id and article_id = p_article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if exists (select 1 from public.article_main_images where asset_id = p_asset_id)
    or exists (select 1 from public.article_body_images where asset_id = p_asset_id) then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  delete from private.article_revision_media_refs where asset_id = p_asset_id;
  update public.media_assets set status = 'deleting', expiry_attempted_at = null where id = p_asset_id;
  insert into public.audit_events(actor_user_id, action, resource_type, resource_id, correlation_id)
    values (actor, 'article.image_purged', 'article', p_article_id, gen_random_uuid());
  return '{"ok":true}'::jsonb;
end;
$$;
revoke all on function public.purge_article_image(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_article_image(uuid, uuid) to authenticated;


CREATE OR REPLACE FUNCTION public.list_article_audit_events(p_limit integer DEFAULT 20, p_action text DEFAULT NULL::text, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(event_id uuid, action text, resource_id uuid, created_at timestamp with time zone, actor_label text, article_exists boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pattern text;
begin
  if not private.is_active_administrator() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51
    or (p_action is not null and p_action not in (
      'article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored', 'article.deleted',
      'article.submitted', 'article.returned', 'article.image_purged'
    ))
    or (p_search is not null and pg_catalog.char_length(p_search) > 80)
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid audit request.' using errcode = '22023';
  end if;
  pattern := case when pg_catalog.btrim(coalesce(p_search,'')) = '' then null
    else '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
      pg_catalog.btrim(p_search),'\','\\'),'%','\%'),'_','\_') || '%' end;

  return query
  select e.id, e.action, e.resource_id, e.created_at,
    coalesce(p.display_name, 'Former member')::text,
    exists(select 1 from public.articles a where a.id=e.resource_id)
  from public.audit_events e
  left join public.profiles p on p.auth_user_id = e.actor_user_id
  where e.resource_type = 'article'
    and e.action in ('article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored', 'article.deleted',
      'article.submitted', 'article.returned', 'article.image_purged')
    and (p_action is null or e.action = p_action)
    and (pattern is null
      or p.display_name ilike pattern escape '\'
      or exists(select 1 from public.articles a
        where a.id = e.resource_id and a.title ilike pattern escape '\')
      or (pg_catalog.to_char(e.created_at at time zone 'America/New_York','YYYY-MM-DD')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMonth FMDD, YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMonth FMDD YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','Mon FMDD, YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','Mon FMDD YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMM/FMDD/YYYY'))
        ilike pattern escape '\')
    and (p_before_at is null or (e.created_at, e.id) < (p_before_at, p_before_id))
  order by e.created_at desc, e.id desc
  limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admit_article_image_upload(p_article_id uuid, p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_profile uuid; asset public.media_assets%rowtype; article public.articles%rowtype;
  current_window timestamptz; attempts integer; checked_at timestamptz;
begin
  actor_profile:=private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_asset_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  -- Retain caller/article authority during admission. Asset state is a plain
  -- snapshot read: taking an asset lock here could invert finalization locks.
  -- The existing begin/finalize operations recheck asset state after decoding.
  select * into article from public.articles where id=p_article_id for share;
  if not found or (not private.article_authority(article.id,auth.uid(),'edit')) then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id and article_id=p_article_id;
  if not found or not private.can_use_asset(asset.id,auth.uid()) then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.status not in ('draft','published') then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if asset.status='finalized' then return '{"ok":true,"replayed":true}'::jsonb; end if;
  if asset.status not in ('pending','uploading') then
    return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  insert into private.upload_processing_limits(actor_user_id) values(auth.uid()) on conflict do nothing;
  select window_start,attempt_count into current_window,attempts from private.upload_processing_limits
    where actor_user_id=auth.uid() for update;
  checked_at:=clock_timestamp();
  if checked_at>=current_window+interval '60 seconds' then
    update private.upload_processing_limits set window_start=checked_at,attempt_count=1 where actor_user_id=auth.uid();
  elsif attempts>=30 then
    return jsonb_build_object('ok',false,'code','rate_limited','retryAfter',least(60,greatest(1,ceil(extract(epoch from current_window+interval '60 seconds'-checked_at))::integer)));
  else
    update private.upload_processing_limits set attempt_count=attempt_count+1 where actor_user_id=auth.uid();
  end if;
  return '{"ok":true,"replayed":false}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.begin_article_image_upload(p_actor_user_id uuid, p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_profile uuid; actor_admin boolean; asset public.media_assets%rowtype;
  article public.articles%rowtype;
begin
  actor_profile := private.lock_media_actor(p_actor_user_id);
  if actor_profile is null then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id,m.role='administrator' into actor_profile,actor_admin
    from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=p_actor_user_id and p.active and m.active;
  select * into asset from public.media_assets where id=p_asset_id;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id=asset.article_id for update;
  if not private.article_authority(article.id,p_actor_user_id,'edit') then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if article.status not in ('draft','published') or not private.can_use_asset(asset.id,p_actor_user_id)
    or asset.status not in ('pending','uploading') then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if asset.status='pending' then
    update public.media_assets set status='uploading' where id=p_asset_id;
  end if;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,
    'replayed',asset.status='uploading');
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_article_image_upload(p_actor_user_id uuid, p_asset_id uuid, p_sha256 text, p_byte_size integer, p_width integer, p_height integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare asset public.media_assets%rowtype; article public.articles%rowtype;
  actor_profile uuid; actor_admin boolean; object_metadata jsonb; locator_article_id uuid;
begin
  actor_profile := private.lock_media_actor(p_actor_user_id);
  if actor_profile is null then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id,m.role='administrator' into actor_profile,actor_admin
    from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=p_actor_user_id and p.active and m.active;
  -- Locate without a row lock, then match begin/removal ordering: article before asset.
  select a.article_id into locator_article_id from public.media_assets a where a.id=p_asset_id;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id=locator_article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  -- Either row can disappear while waiting; never trust the unlocked locator.
  if not found or asset.article_id<>article.id then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if not private.can_use_asset(asset.id,p_actor_user_id) then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if not private.article_authority(article.id,p_actor_user_id,'edit') then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if article.status not in ('draft','published') or asset.status='deleting' then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if asset.status='finalized' then
    if asset.sha256=p_sha256 and asset.byte_size=p_byte_size
      and asset.width=p_width and asset.height=p_height then
      return jsonb_build_object('ok',true,'assetId',asset.id,'replayed',true);
    end if;
    return '{"ok":false,"code":"request_conflict"}'::jsonb;
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_byte_size not between 1 and 10485760
    or p_width not between 1 and 6000 or p_height not between 1 and 6000
    or p_width::bigint*p_height>24000000 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  select metadata into object_metadata from storage.objects
    where bucket_id='article-media' and name=asset.object_key;
  if object_metadata is null
    or object_metadata ->> 'mimetype' <> 'image/webp'
    or object_metadata ->> 'size' <> p_byte_size::text then
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end if;
  update public.media_assets set status='finalized',sha256=p_sha256,
    byte_size=p_byte_size,width=p_width,height=p_height,finalized_at=now()
    where id=p_asset_id;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',false);
exception when others then
  raise log 'media finalization failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION private.transition_article(p_article_id uuid, p_expected_version integer, p_request_id uuid, p_operation text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  actor uuid := auth.uid(); actor_profile uuid; fingerprint bytea; note text := btrim(p_note);
  receipt private.draft_write_receipts%rowtype; article public.articles%rowtype;
  snapshot jsonb; current_input jsonb; checked jsonb;
  committed_version integer; committed_at timestamptz; result_status text; mode text;
begin
  if p_operation not in ('submit','return','publish','archive','restore') then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_operation='restore' and not private.is_active_administrator() then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null
    or p_expected_version < 1 then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if p_operation='return' and (note is null or char_length(note) not between 1 and 500) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  mode := case p_operation when 'submit' then 'submit' when 'return' then 'review'
    when 'publish' then 'publish' else 'archive' end;
  fingerprint := private.draft_request_hash(
    case when p_operation='return' then 'return:'||note else p_operation end,
    p_article_id,p_expected_version,'{}'::jsonb);
  select * into receipt from private.draft_write_receipts
    where actor_user_id=actor and request_id=p_request_id;
  result_status := case p_operation when 'archive' then 'archived'
    when 'submit' then 'draft' when 'return' then 'draft' else 'published' end;
  if receipt.request_id is not null and receipt.operation=p_operation
    and receipt.payload_hash=fingerprint then
    select * into article from public.articles where id=p_article_id
      and private.article_authority(id,actor,'replay') for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    return jsonb_build_object('ok',true,'articleId',receipt.article_id,
      'status',result_status,'version',receipt.result_version,
      'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if receipt.request_id is not null then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
  select * into article from public.articles where id=p_article_id
    and case when p_operation='restore' then true
      else private.article_authority(id,actor,mode) end for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.edit_version<>p_expected_version or article.edit_version=2147483647
    or (p_operation='submit' and (article.status<>'draft' or article.review_requested_at is not null
      or exists (select 1 from public.media_assets u where u.article_id=p_article_id and u.status in ('pending','uploading'))))
    or (p_operation='return' and (article.status<>'draft' or article.review_requested_at is null))
    or (p_operation='publish' and article.status<>'draft')
    or (p_operation='archive' and article.status<>'published')
    or (p_operation='restore' and article.status<>'archived') then
    return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if p_operation in ('submit','publish','restore') then
    snapshot := private.capture_draft_snapshot(p_article_id);
    current_input := (snapshot->'article') - array[
      'id','ownerProfileId','status','publishedAt','archivedAt','createdAt','updatedAt','editVersion','slug'
    ] || jsonb_build_object('schemaVersion',1,'categoryIds',snapshot->'categoryIds',
      'tagIds',snapshot->'tagIds','contributors',snapshot->'contributors');
    checked := private.check_draft_input(current_input);
    if checked->>'ok'<>'true' then return checked; end if;
    if not private.is_publication_ready(p_article_id,checked->'value') then
      return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  end if;
  begin
    if p_operation='submit' then
      update public.articles set review_requested_at=now(),review_note=null,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    elsif p_operation='return' then
      update public.articles set review_requested_at=null,review_note=note,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    elsif p_operation='publish' then
      update public.articles set status='published',published_at=now(),review_note=null,
        published_by_profile_id=actor_profile,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    elsif p_operation='archive' then
      update public.articles set status='archived',archived_at=now(),edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    else
      update public.articles set status='published',archived_at=null,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    end if;
    insert into public.article_revisions(article_id,actor_user_id,snapshot)
      values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'article.'||case p_operation when 'submit' then 'submitted' when 'return' then 'returned'
        when 'publish' then 'published' when 'archive' then 'archived' else 'restored' end,
        'article',p_article_id,p_request_id);
    insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,
      expected_version,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,p_operation,p_article_id,p_expected_version,
        fingerprint,committed_version,committed_at,true);
  exception when others then
    raise log 'article transition failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'status',result_status,
    'version',committed_version,'updatedAt',committed_at,'replayed',false,'changed',true);
exception when others then
  raise log 'article transition failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;
