create function public.register_retired_media_keys(p_article_id uuid,p_asset_ids uuid[],p_claim_token uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare asset_id uuid; key_value text; registry private.media_key_registry%rowtype;
begin
 if p_article_id is null or p_claim_token is null or p_asset_ids is null or cardinality(p_asset_ids)>100
  or coalesce(array_ndims(p_asset_ids),1)<>1 or coalesce(array_lower(p_asset_ids,1),1)<>1
  or array_position(p_asset_ids,null::uuid) is not null then return false; end if;
 perform 1 from private.retired_article_ids r where r.article_id=p_article_id and r.claim_token=p_claim_token and r.claim_until>=clock_timestamp() for update;
 if not found then return false; end if;
 foreach asset_id in array p_asset_ids loop
  key_value:=p_article_id::text||'/'||asset_id::text||'.webp';
  insert into private.media_key_registry(object_key,asset_id,article_id,retired)
   values(key_value,asset_id,p_article_id,true) on conflict do nothing;
  select * into registry from private.media_key_registry where object_key=key_value for update;
  if found and registry.retired and registry.article_id=p_article_id and registry.asset_id=asset_id
    and not exists(select 1 from public.media_assets where object_key=key_value) then
   insert into private.media_cleanup_ledger(object_key,article_id,asset_id)
    values(key_value,p_article_id,asset_id) on conflict do nothing;
  end if;
 end loop;
 return true;
end $$;
revoke all on function public.register_retired_media_keys(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.register_retired_media_keys(uuid,uuid[],uuid) to service_role;
