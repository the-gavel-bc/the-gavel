-- Supplied actors come from trusted media routes, not auth.uid() (the caller is service_role).
create function private.lock_media_actor(p_actor uuid) returns uuid
language plpgsql set search_path='' as $$
declare profile_id uuid;
begin
  if p_actor is null then return null; end if;
  -- Match editorial actor-lock order and retain eligibility until this transaction commits.
  perform id from auth.users where id=p_actor for share;
  perform user_id from public.memberships where user_id=p_actor for share;
  select id into profile_id from public.profiles where auth_user_id=p_actor for share;
  -- A fresh statement after lock waits sees committed revocation or profile deactivation.
  if profile_id is null or not private.eligible_media_actor(p_actor) then return null; end if;
  return profile_id;
end;
$$;
revoke all on function private.lock_media_actor(uuid) from public,anon,authenticated,service_role;

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
  if article.status<>'draft' or (asset.uploader_user_id<>p_actor_user_id and not actor_admin)
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
  actor_profile uuid; actor_admin boolean; object_metadata jsonb;
begin
  actor_profile := private.lock_media_actor(p_actor_user_id);
  if actor_profile is null then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id,m.role='administrator' into actor_profile,actor_admin
    from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=p_actor_user_id and p.active and m.active;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id=asset.article_id for update;
  if asset.uploader_user_id<>p_actor_user_id and not actor_admin then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if article.owner_profile_id<>actor_profile and not actor_admin then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if article.status<>'draft' or asset.status='deleting' then
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

create or replace function public.complete_article_image_removal(p_actor_user_id uuid,p_asset_id uuid)
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
  if not found then return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',true); end if;
  select * into article from public.articles where id=asset.article_id for update;
  if article.owner_profile_id<>actor_profile and not actor_admin then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if asset.status<>'deleting' or exists(
    select 1 from public.article_body_images where asset_id=p_asset_id
  ) or exists(
    select 1 from public.article_main_images where asset_id=p_asset_id
  ) or exists(select 1 from private.article_revision_media_refs r
    where r.asset_id=p_asset_id)
  then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if exists(select 1 from storage.objects where bucket_id='article-media' and name=asset.object_key) then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  delete from public.media_assets where id=p_asset_id;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',false);
exception when others then
  raise log 'media removal completion failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;

