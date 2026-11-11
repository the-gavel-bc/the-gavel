-- Explicit cancellation fences finalization; existing deletion triggers retain late-write cleanup keys.
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
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.owner_profile_id<>actor_profile and not private.is_active_administrator() then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if not found or asset.article_id<>article.id then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.status not in ('draft','published') then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
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
