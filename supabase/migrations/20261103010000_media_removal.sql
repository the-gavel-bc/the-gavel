-- Hide an unused asset before the trusted server deletes its private object.
create table private.article_revision_media_refs (
  revision_id uuid primary key references public.article_revisions(id) on update restrict on delete cascade,
  article_id uuid not null,
  asset_id uuid not null,
  foreign key (asset_id,article_id) references public.media_assets(id,article_id)
    on update restrict on delete restrict
);
create index article_revision_media_refs_asset_id_idx on private.article_revision_media_refs(asset_id);
alter table private.article_revision_media_refs enable row level security;
revoke all on table private.article_revision_media_refs from public,anon,authenticated;

create function private.capture_revision_main_image_ref() returns trigger
language plpgsql security definer set search_path = '' as $$
declare image_id uuid;
begin
  if new.snapshot->'mainImage'->>'assetId' is not null then
    image_id := (new.snapshot->'mainImage'->>'assetId')::uuid;
    insert into private.article_revision_media_refs(revision_id,article_id,asset_id)
      values(new.id,new.article_id,image_id);
  end if;
  return new;
end;
$$;
revoke all on function private.capture_revision_main_image_ref() from public,anon,authenticated;
create trigger capture_revision_main_image_ref after insert on public.article_revisions
  for each row execute function private.capture_revision_main_image_ref();
insert into private.article_revision_media_refs(revision_id,article_id,asset_id)
select id,article_id,(snapshot->'mainImage'->>'assetId')::uuid
from public.article_revisions where snapshot->'mainImage'->>'assetId' is not null;

create function public.mark_article_image_for_removal(p_asset_id uuid)
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
  if exists(select 1 from public.article_main_images where asset_id=p_asset_id)
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
revoke all on function public.mark_article_image_for_removal(uuid) from public,anon,authenticated;
grant execute on function public.mark_article_image_for_removal(uuid) to authenticated;

-- The object must already be absent. A lost response may safely retry cleanup.
create function public.complete_article_image_removal(p_actor_user_id uuid,p_asset_id uuid)
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
revoke all on function public.complete_article_image_removal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_article_image_removal(uuid,uuid) to service_role;
