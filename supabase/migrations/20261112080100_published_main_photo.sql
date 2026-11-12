-- Preserve version, receipt, revision retention and actor/article/asset locking.
create or replace function public.set_article_main_image(
  p_article_id uuid,p_expected_version integer,p_request_id uuid,p_asset_id uuid,p_alt_text text,p_credit text,p_caption text default null
) returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare actor uuid := auth.uid(); actor_profile uuid; article public.articles%rowtype;
  receipt private.media_write_receipts%rowtype; image public.article_main_images%rowtype;
  asset public.media_assets%rowtype; fingerprint bytea; changed boolean;
  committed_version integer; committed_at timestamptz; legacy_fingerprint bytea;
begin
  p_caption := nullif(regexp_replace(p_caption,'^[[:space:]]+|[[:space:]]+$','','g'),'');
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 1
    or (p_asset_id is null and (p_alt_text is not null or p_credit is not null or p_caption is not null))
    or (p_asset_id is not null and (
      p_alt_text is null or char_length(p_alt_text) not between 1 and 240
      or p_alt_text ~ '(^[[:space:]]|[[:space:]]$)'
      or p_credit is null or char_length(p_credit) not between 1 and 240
      or p_credit ~ '(^[[:space:]]|[[:space:]]$)'
      or (p_caption is not null and (char_length(p_caption) not between 1 and 400
        or p_caption ~ '(^[[:space:]]|[[:space:]]$)'))
    )) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  legacy_fingerprint := sha256(convert_to(jsonb_build_object(
    'articleId',p_article_id,'expectedVersion',p_expected_version,'assetId',p_asset_id,
    'altText',p_alt_text,'credit',p_credit)::text,'UTF8'));
  fingerprint := sha256(convert_to(jsonb_build_object(
    'articleId',p_article_id,'expectedVersion',p_expected_version,'assetId',p_asset_id,
    'altText',p_alt_text,'credit',p_credit,'caption',p_caption)::text,'UTF8'));
  select * into article from public.articles where id=p_article_id for update;
  if not found or (article.owner_profile_id<>actor_profile and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into receipt from private.media_write_receipts where actor_user_id=actor and request_id=p_request_id;
  if found then
    if receipt.article_id=p_article_id and (receipt.payload_hash=fingerprint or
      (p_caption is null and receipt.payload_hash=legacy_fingerprint)) then
      return jsonb_build_object('ok',true,'articleId',p_article_id,'version',receipt.result_version,
        'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
    end if;
    return '{"ok":false,"code":"request_conflict"}'::jsonb;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if article.status not in ('draft','published') or article.edit_version<>p_expected_version then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if p_asset_id is not null then
    select * into asset from public.media_assets where id=p_asset_id for share;
    if not found or asset.article_id<>p_article_id or asset.status<>'finalized' then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
  end if;
  select * into image from public.article_main_images where article_id=p_article_id;
  changed := case when p_asset_id is null then image.asset_id is not null
    else image.asset_id is distinct from p_asset_id
      or image.alt_text is distinct from p_alt_text or image.credit is distinct from p_credit
      or image.caption is distinct from p_caption end;
  if changed and article.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  committed_version := article.edit_version;
  committed_at := article.updated_at;
  begin
    if changed then
      if p_asset_id is null then
        delete from public.article_main_images where article_id=p_article_id;
      else
        insert into public.article_main_images(article_id,asset_id,alt_text,credit,caption)
          values(p_article_id,p_asset_id,p_alt_text,p_credit,p_caption)
          on conflict (article_id) do update set asset_id=excluded.asset_id,
            alt_text=excluded.alt_text,credit=excluded.credit,caption=excluded.caption;
      end if;
      update public.articles set edit_version=edit_version+1 where id=p_article_id
        returning edit_version,updated_at into committed_version,committed_at;
      insert into public.article_revisions(article_id,actor_user_id,snapshot)
        values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
        values(actor,'article.updated','article',p_article_id,p_request_id);
    end if;
    insert into private.media_write_receipts(actor_user_id,request_id,article_id,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,p_article_id,fingerprint,committed_version,committed_at,changed);
  exception when others then
    raise log 'main image write failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'version',committed_version,
    'updatedAt',committed_at,'replayed',false,'changed',changed);
exception when others then
  raise log 'main image write failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
revoke all on function public.set_article_main_image(uuid,integer,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.set_article_main_image(uuid,integer,uuid,uuid,text,text,text)
  to authenticated;
