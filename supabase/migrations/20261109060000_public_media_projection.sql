create or replace function public.get_public_article_media(p_article_id uuid,p_asset_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object('kind','ok','byteSize',m.byte_size,'sha256',m.sha256)
    from public.media_assets m
    join storage.objects o on o.bucket_id='article-media' and o.name=m.object_key
    where m.id=p_asset_id and m.article_id=p_article_id
      and m.object_key=p_article_id::text||'/'||p_asset_id::text||'.webp'
      and o.metadata->>'cacheControl'='no-store'
      and private.can_read_published_media(m.object_key)
  ),jsonb_build_object('kind','notFound'));
$$;
revoke all on function public.get_public_article_media(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_public_article_media(uuid,uuid) to anon,authenticated;
