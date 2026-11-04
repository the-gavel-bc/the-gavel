-- Preserve current and historical body images during cleanup.
create or replace function public.mark_article_image_for_removal(p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_profile uuid; asset public.media_assets%rowtype;
  article public.articles%rowtype;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_asset_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id=asset.article_id for update;
  if article.owner_profile_id<>actor_profile and not private.is_active_administrator() then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if article.status<>'draft' then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if asset.status='uploading' then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if exists(select 1 from public.article_body_images where asset_id=p_asset_id)
    or exists(select 1 from public.article_main_images where asset_id=p_asset_id)
    or exists(select 1 from private.article_revision_media_refs r
      where r.asset_id=p_asset_id) then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if asset.status='deleting' then
    return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',true);
  end if;
  update public.media_assets set status='deleting' where id=p_asset_id;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',false);
exception when others then
  raise log 'media removal mark failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
create or replace function public.complete_article_image_removal(p_actor_user_id uuid,p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_profile uuid; actor_admin boolean; asset public.media_assets%rowtype;
  article public.articles%rowtype;
begin
  if not private.eligible_media_actor(p_actor_user_id) then
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
