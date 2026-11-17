-- Automatic expiry of unused article images (service role only, called by the
-- daily cron route). An image expires when it was finalized more than the
-- retention period ago, nothing current or retained references it, and its
-- article is a draft or published. Claims skip rows someone holds locked.
create table private.media_expiry_log (
  asset_id uuid primary key,
  article_id uuid not null,
  object_key text not null,
  expired_at timestamptz not null default pg_catalog.now()
);
revoke all on table private.media_expiry_log from public, anon, authenticated;

create function private.media_asset_in_use(p_asset_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.article_body_images where asset_id = p_asset_id)
    or exists (select 1 from public.article_main_images where asset_id = p_asset_id)
    or exists (select 1 from private.article_revision_media_refs where asset_id = p_asset_id);
$$;
revoke all on function private.media_asset_in_use(uuid) from public, anon, authenticated;

create function public.claim_expired_unused_uploads(
  p_older_than interval default interval '7 days', p_limit integer default 25
) returns table (asset_id uuid, object_key text)
language plpgsql volatile security definer set search_path = '' as $$
declare cand record; a public.media_assets%rowtype; ar public.articles%rowtype;
  claimed integer := 0;
begin
  if p_older_than is null or p_older_than < interval '1 day'
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid expiry request.' using errcode = '22023';
  end if;
  for cand in
    select m.id, m.article_id from public.media_assets m
    where m.status in ('finalized','deleting')
      and coalesce(m.finalized_at, m.created_at) < pg_catalog.now() - p_older_than
      and not private.media_asset_in_use(m.id)
    order by m.created_at, m.id
    limit p_limit * 4
  loop
    exit when claimed >= p_limit;
    -- Same order as manual removal: article first, then the image. A row an
    -- editor or save holds is left for the next run.
    select * into ar from public.articles where id = cand.article_id for update skip locked;
    continue when not found or ar.status not in ('draft','published');
    select * into a from public.media_assets where id = cand.id for update skip locked;
    continue when not found
      or a.status not in ('finalized','deleting')
      or coalesce(a.finalized_at, a.created_at) >= pg_catalog.now() - p_older_than
      or private.media_asset_in_use(a.id);
    if a.status = 'finalized' then
      update public.media_assets set status = 'deleting' where id = a.id;
    end if;
    asset_id := a.id; object_key := a.object_key; claimed := claimed + 1;
    return next;
  end loop;
end;
$$;

create function public.complete_expired_unused_upload(p_asset_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
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
  insert into private.media_expiry_log(asset_id, article_id, object_key)
    values (a.id, a.article_id, a.object_key) on conflict do nothing;
  delete from public.media_assets where id = p_asset_id;
  return '{"ok":true,"replayed":false}'::jsonb;
end;
$$;

revoke all on function public.claim_expired_unused_uploads(interval,integer),
  public.complete_expired_unused_upload(uuid) from public, anon, authenticated;
grant execute on function public.claim_expired_unused_uploads(interval,integer),
  public.complete_expired_unused_upload(uuid) to service_role;
