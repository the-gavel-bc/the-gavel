-- Explicit cleanup only; current and retained revision references remain authoritative.
create function public.list_unused_article_uploads(
  p_article_id uuid, p_after_id uuid default null, p_limit integer default 25
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_profile uuid; article public.articles%rowtype; items jsonb; more boolean;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_limit is null or p_limit < 1 or p_limit > 50 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  select * into article from public.articles where id=p_article_id for share;
  if not found or (article.owner_profile_id<>actor_profile and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if article.status not in ('draft','published') then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  with candidates as materialized (
    select a.id,a.created_at,a.status from public.media_assets a
    where a.article_id=p_article_id and a.status in ('finalized','deleting')
      and (p_after_id is null or a.id>p_after_id)
      and not exists(select 1 from public.article_body_images r where r.asset_id=a.id)
      and not exists(select 1 from public.article_main_images r where r.asset_id=a.id)
      and not exists(select 1 from private.article_revision_media_refs r where r.asset_id=a.id)
    order by a.id limit p_limit+1
  ), page as (select * from candidates order by id limit p_limit)
  select coalesce((select jsonb_agg(jsonb_build_object('assetId',id,'createdAt',created_at,'status',status) order by id) from page),'[]'::jsonb),
    (select count(*)>p_limit from candidates) into items,more;
  return jsonb_build_object('ok',true,'items',items,'nextCursor',
    case when more then items->-1->>'assetId' else null end);
exception when others then
  raise log 'unused media listing failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
revoke all on function public.list_unused_article_uploads(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_unused_article_uploads(uuid,uuid,integer) to authenticated;

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
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.status not in ('draft','published') then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
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
