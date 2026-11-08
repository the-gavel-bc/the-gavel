-- Service-only bounded, leased claims. Ledger records are never deleted.
create function public.claim_media_cleanup(p_limit integer)
returns table(object_key text,claim_token uuid) language plpgsql volatile security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid limit' using errcode='22023'; end if;
 return query with candidates as (
  select l.object_key from private.media_cleanup_ledger l
   where l.claim_until is null or l.claim_until<clock_timestamp()
   order by l.last_attempt_at nulls first,l.object_key for update skip locked limit p_limit
 ) update private.media_cleanup_ledger l set claim_token=gen_random_uuid(),claim_until=clock_timestamp()+interval '5 minutes',last_attempt_at=clock_timestamp()
  from candidates c where l.object_key=c.object_key returning l.object_key,l.claim_token;
end $$;
create function public.finish_media_cleanup(p_object_key text,p_claim_token uuid,p_success boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if p_object_key is null or p_claim_token is null or p_success is null then return false; end if;
 update private.media_cleanup_ledger l set last_succeeded_at=case when p_success then clock_timestamp() else l.last_succeeded_at end,
  claim_token=null,claim_until=null where l.object_key=p_object_key and l.claim_token=p_claim_token;
 return found;
end $$;
create function public.claim_retired_article_prefixes(p_limit integer)
returns table(article_id uuid,scan_offset integer,claim_token uuid) language plpgsql volatile security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid limit' using errcode='22023'; end if;
 return query with candidates as (
  select r.article_id from private.retired_article_ids r where r.claim_until is null or r.claim_until<clock_timestamp()
   order by r.last_attempt_at nulls first,r.article_id for update skip locked limit p_limit
 ) update private.retired_article_ids r set claim_token=gen_random_uuid(),claim_until=clock_timestamp()+interval '5 minutes',last_attempt_at=clock_timestamp()
  from candidates c where r.article_id=c.article_id returning r.article_id,r.scan_offset,r.claim_token;
end $$;
create function public.register_retired_media_key(p_article_id uuid,p_asset_id uuid,p_claim_token uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare key_value text; registry private.media_key_registry%rowtype;
begin
 if p_article_id is null or p_asset_id is null or p_claim_token is null then return false; end if;
 perform 1 from private.retired_article_ids r where r.article_id=p_article_id and r.claim_token=p_claim_token and r.claim_until>=clock_timestamp() for update;
 if not found then return false; end if;
 key_value:=p_article_id::text||'/'||p_asset_id::text||'.webp';
 insert into private.media_key_registry(object_key,asset_id,article_id,retired)
  values(key_value,p_asset_id,p_article_id,true) on conflict do nothing;
 select * into registry from private.media_key_registry where object_key=key_value for update;
 if not found or not registry.retired or registry.article_id<>p_article_id or registry.asset_id<>p_asset_id then return false; end if;
 if exists(select 1 from public.media_assets where object_key=key_value) then return false; end if;
 insert into private.media_cleanup_ledger(object_key,article_id,asset_id) values(key_value,p_article_id,p_asset_id) on conflict do nothing;
 return true;
end $$;
create function public.finish_retired_article_scan(p_article_id uuid,p_claim_token uuid,p_count integer,p_success boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if p_article_id is null or p_claim_token is null or p_count is null or p_count not between 0 and 100 or p_success is null then return false; end if;
 update private.retired_article_ids r set
  scan_offset=case when not p_success then r.scan_offset when p_count<100 then 0 else r.scan_offset+100 end,
  claim_token=null,claim_until=null where r.article_id=p_article_id and r.claim_token=p_claim_token;
 return found;
end $$;
create function public.get_media_cleanup_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_administrator() or not exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active)
  then raise exception 'Administrator access required' using errcode='42501'; end if;
 return jsonb_build_object('keys',(select count(*) from private.media_cleanup_ledger),
  'prefixes',(select count(*) from private.retired_article_ids),
  'unattempted',(select count(*) from private.media_cleanup_ledger where last_attempt_at is null),
  'oldestAttempt',(select min(last_attempt_at) from private.media_cleanup_ledger));
end $$;
revoke all on function public.claim_media_cleanup(integer),public.finish_media_cleanup(text,uuid,boolean),
 public.claim_retired_article_prefixes(integer),public.register_retired_media_key(uuid,uuid,uuid),
 public.finish_retired_article_scan(uuid,uuid,integer,boolean),public.get_media_cleanup_status() from public,anon,authenticated;
grant execute on function public.claim_media_cleanup(integer),public.finish_media_cleanup(text,uuid,boolean),
 public.claim_retired_article_prefixes(integer),public.register_retired_media_key(uuid,uuid,uuid),
 public.finish_retired_article_scan(uuid,uuid,integer,boolean) to service_role;
grant execute on function public.get_media_cleanup_status() to authenticated;
