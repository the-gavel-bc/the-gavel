-- Task 3 starts with private reservation storage. Trusted writes are server-only.
create table public.media_assets (
  id uuid primary key,
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  uploader_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  request_id uuid not null,
  object_key text not null unique,
  status text not null default 'pending' check (status in ('pending','finalized','deleting')),
  byte_size integer,
  width integer,
  height integer,
  sha256 text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (uploader_user_id,request_id),
  unique (id,article_id),
  constraint media_assets_validated_metadata check (
    (status='pending' and byte_size is null and width is null and height is null and sha256 is null and finalized_at is null)
    or (status='finalized' and byte_size between 1 and 10485760
      and width between 1 and 6000 and height between 1 and 6000 and width::bigint * height <= 24000000
      and sha256 ~ '^[0-9a-f]{64}$' and finalized_at is not null)
    or status='deleting'
  )
);
create index media_assets_article_id_idx on public.media_assets(article_id);
alter table public.media_assets enable row level security;
revoke all on table public.media_assets from public,anon,authenticated;
grant select on table public.media_assets to authenticated;
create policy media_assets_article_read on public.media_assets for select to authenticated
using (private.can_read_article(article_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('article-media','article-media',false,10485760,array['image/webp']);
create policy article_media_finalized_read on storage.objects for select to authenticated
using (
  bucket_id='article-media' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
  and exists (
    select 1 from public.media_assets a
    where a.object_key=name and a.status='finalized' and private.can_read_article(a.article_id)
  )
);

create function public.request_article_image_upload(p_article_id uuid,p_request_id uuid)
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
  if target.status <> 'draft' then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
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
revoke all on function public.request_article_image_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_article_image_upload(uuid,uuid) to authenticated;
