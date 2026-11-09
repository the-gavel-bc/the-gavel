-- Audit records may predate the deletion receipt table. Preserve known deleted IDs too.
insert into private.article_id_registry(article_id)
 select distinct e.resource_id from public.audit_events e where e.resource_type='article' and e.action='article.deleted'
 and not exists(select 1 from public.articles a where a.id=e.resource_id) on conflict do nothing;
insert into private.retired_article_ids(article_id)
 select distinct e.resource_id from public.audit_events e where e.resource_type='article' and e.action='article.deleted'
 and not exists(select 1 from public.articles a where a.id=e.resource_id) on conflict do nothing;
create or replace function public.claim_media_cleanup(p_limit integer)
returns table(object_key text,claim_token uuid) language plpgsql volatile security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid limit' using errcode='22023'; end if;
 return query with candidates as (
  select l.object_key from private.media_cleanup_ledger l join private.media_key_registry r on r.object_key=l.object_key
   where r.retired and not exists(select 1 from public.media_assets a where a.object_key=l.object_key)
   and (l.claim_until is null or l.claim_until<clock_timestamp())
   order by l.last_attempt_at nulls first,l.object_key for update of l skip locked limit p_limit
 ) update private.media_cleanup_ledger l set claim_token=gen_random_uuid(),claim_until=clock_timestamp()+interval '5 minutes',last_attempt_at=clock_timestamp()
  from candidates c where l.object_key=c.object_key returning l.object_key,l.claim_token;
end $$;
