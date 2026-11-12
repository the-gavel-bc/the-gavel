-- Uploads on published articles stay private until a current reference is attached.
create or replace function public.request_article_image_upload(p_article_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_profile uuid; target public.articles%rowtype;
  previous public.media_assets%rowtype; asset_id uuid;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select * into target from public.articles where id=p_article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if target.owner_profile_id <> actor_profile and not private.is_active_administrator() then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if target.status not in ('draft','published') then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  select * into previous from public.media_assets where uploader_user_id=actor and request_id=p_request_id;
  if found then
    if previous.article_id <> p_article_id then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    if previous.status='deleting' then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    return jsonb_build_object('ok',true,'assetId',previous.id,'status',previous.status,'replayed',true);
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  asset_id := gen_random_uuid();
  insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key)
    values(asset_id,p_article_id,actor,p_request_id,p_article_id::text||'/'||asset_id::text||'.webp');
  return jsonb_build_object('ok',true,'assetId',asset_id,'status','pending','replayed',false);
exception when unique_violation then
  return '{"ok":false,"code":"request_conflict"}'::jsonb;
when others then
  raise log 'media reservation failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;

create or replace function public.admit_article_image_upload(p_article_id uuid,p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not found or (article.owner_profile_id<>actor_profile and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id and article_id=p_article_id;
  if not found or (asset.uploader_user_id<>auth.uid() and not private.is_active_administrator()) then
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
$$;

create or replace function public.begin_article_image_upload(p_actor_user_id uuid,p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if article.owner_profile_id<>actor_profile and not actor_admin then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if article.status not in ('draft','published') or (asset.uploader_user_id<>p_actor_user_id and not actor_admin)
    or asset.status not in ('pending','uploading') then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if asset.status='pending' then
    update public.media_assets set status='uploading' where id=p_asset_id;
  end if;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,
    'replayed',asset.status='uploading');
end;
$$;

create or replace function public.finalize_article_image_upload(
  p_actor_user_id uuid,p_asset_id uuid,p_sha256 text,p_byte_size integer,p_width integer,p_height integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if asset.uploader_user_id<>p_actor_user_id and not actor_admin then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if article.owner_profile_id<>actor_profile and not actor_admin then
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
$$;

revoke all on function public.request_article_image_upload(uuid,uuid),public.admit_article_image_upload(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.request_article_image_upload(uuid,uuid),public.admit_article_image_upload(uuid,uuid)
  to authenticated;
revoke all on function public.begin_article_image_upload(uuid,uuid),public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.begin_article_image_upload(uuid,uuid),public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)
  to service_role;
