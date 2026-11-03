-- A trusted route claims an asset before Storage upload. Removal cannot pass
-- the article/asset locks while the route owns this persistent claim.
alter table public.media_assets drop constraint media_assets_status_check;
alter table public.media_assets add constraint media_assets_status_check
  check (status in ('pending','uploading','finalized','deleting'));
alter table public.media_assets drop constraint media_assets_validated_metadata;
alter table public.media_assets add constraint media_assets_validated_metadata check (
  (status in ('pending','uploading') and byte_size is null and width is null
    and height is null and sha256 is null and finalized_at is null)
  or (status='finalized' and byte_size between 1 and 10485760
    and width between 1 and 6000 and height between 1 and 6000
    and width::bigint * height <= 24000000
    and sha256 ~ '^[0-9a-f]{64}$' and finalized_at is not null)
  or status='deleting'
);

create function public.begin_article_image_upload(p_actor_user_id uuid,p_asset_id uuid)
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
revoke all on function public.begin_article_image_upload(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.begin_article_image_upload(uuid,uuid) to service_role;
