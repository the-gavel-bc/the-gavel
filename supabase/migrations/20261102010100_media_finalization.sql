-- Only the server service role may attest decoded/re-encoded image metadata.
create function private.eligible_media_actor(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.memberships m on m.user_id=u.id and m.active
    join public.profiles p on p.auth_user_id=u.id and p.active
    where u.id=p_actor and u.email_confirmed_at is not null
      and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
      and (u.raw_app_meta_data ->> 'provider'='google'
        or u.raw_app_meta_data -> 'providers' ? 'google')
  );
$$;
revoke all on function private.eligible_media_actor(uuid) from public,anon,authenticated;

create function public.finalize_article_image_upload(
  p_actor_user_id uuid,p_asset_id uuid,p_sha256 text,p_byte_size integer,p_width integer,p_height integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare asset public.media_assets%rowtype; article public.articles%rowtype;
  actor_profile uuid; actor_admin boolean; object_metadata jsonb;
begin
  if not private.eligible_media_actor(p_actor_user_id) then
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
revoke all on function public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)
  from public,anon,authenticated;
grant execute on function public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)
  to service_role;
