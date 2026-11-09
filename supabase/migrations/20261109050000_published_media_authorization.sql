-- The bucket stays private. This helper exposes only live-reference eligibility,
-- never object paths or metadata, and is invoked by the Storage policy.
create function private.can_read_published_media(p_object_key text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare asset public.media_assets%rowtype; body jsonb;
begin
  if p_object_key is null or char_length(p_object_key)>200 then return false; end if;
  select m.* into asset from public.media_assets m
    join public.articles a on a.id=m.article_id and a.status='published'
    where m.object_key=p_object_key and m.status='finalized';
  if not found then return false; end if;
  if exists(select 1 from public.article_main_images ami
    where ami.article_id=asset.article_id and ami.asset_id=asset.id) then return true; end if;
  if not exists(select 1 from public.article_body_images abi
    where abi.article_id=asset.article_id and abi.asset_id=asset.id) then return false; end if;
  select a.content into body from public.articles a where a.id=asset.article_id;
  if body is null or not private.is_valid_draft_document(body) then return false; end if;
  return exists(select 1 from private.body_image_ids(body) b where b.asset_id=asset.id);
end;
$$;
revoke all on function private.can_read_published_media(text) from public,anon,authenticated;
grant execute on function private.can_read_published_media(text) to anon,authenticated;

create policy article_media_published_read on storage.objects
for select to anon,authenticated using (
  bucket_id='article-media'
  and storage.allow_only_operation('object.get_authenticated')
  and metadata->>'cacheControl'='no-store'
  and private.can_read_published_media(name)
);
