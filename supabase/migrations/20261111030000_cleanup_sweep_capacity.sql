-- The permanent ledger keeps growing by design, so each run must be able to
-- revisit the whole backlog. Runs now record their start, and claims made
-- during a run skip rows already attempted in it; the sweeper loops batches
-- until nothing is left or its time budget ends. Failed rows are claimed first
-- so one transient Storage error no longer waits behind every older row.
alter table private.media_cleanup_runtime add column run_started_at timestamptz;

create or replace function public.start_media_cleanup_run() returns uuid language plpgsql volatile security definer set search_path='' as $$
declare token uuid;
begin
 update private.media_cleanup_runtime set run_token=gen_random_uuid(),run_until=clock_timestamp()+interval '10 minutes',
  run_started_at=clock_timestamp(),last_healthy_at=null
  where id=true and (run_until is null or run_until<clock_timestamp()) returning run_token into token;
 return token;
end $$;

-- Rows attempted at or after this instant were already handled in the active
-- run. Outside a run there is no restriction, preserving direct claim behavior.
create function private.cleanup_claim_horizon() returns timestamptz language sql stable set search_path='' as $$
 select coalesce((select r.run_started_at from private.media_cleanup_runtime r
  where r.id=true and r.run_token is not null and r.run_until>=clock_timestamp()),'infinity'::timestamptz);
$$;
revoke all on function private.cleanup_claim_horizon() from public,anon,authenticated,service_role;

create or replace function public.claim_media_cleanup(p_limit integer)
returns table(object_key text,claim_token uuid) language plpgsql volatile security definer set search_path='' as $$
declare horizon timestamptz:=private.cleanup_claim_horizon();
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid limit' using errcode='22023'; end if;
 return query with candidates as (
  select l.object_key from private.media_cleanup_ledger l join private.media_key_registry r on r.object_key=l.object_key
   where r.retired and not exists(select 1 from public.media_assets a where a.object_key=l.object_key)
   and (l.claim_until is null or l.claim_until<clock_timestamp())
   and coalesce(l.last_attempt_at,'-infinity'::timestamptz)<horizon
   order by l.last_succeeded is false desc,l.last_attempt_at nulls first,l.object_key for update of l skip locked limit p_limit
 ) update private.media_cleanup_ledger l set claim_token=gen_random_uuid(),claim_until=clock_timestamp()+interval '5 minutes',last_attempt_at=clock_timestamp()
  from candidates c where l.object_key=c.object_key returning l.object_key,l.claim_token;
end $$;

create or replace function public.claim_retired_article_prefixes(p_limit integer)
returns table(article_id uuid,scan_offset integer,claim_token uuid) language plpgsql volatile security definer set search_path='' as $$
declare horizon timestamptz:=private.cleanup_claim_horizon();
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid limit' using errcode='22023'; end if;
 return query with candidates as (
  select r.article_id from private.retired_article_ids r where (r.claim_until is null or r.claim_until<clock_timestamp())
   and coalesce(r.last_attempt_at,'-infinity'::timestamptz)<horizon
   order by r.last_succeeded is false desc,r.last_attempt_at nulls first,r.article_id for update skip locked limit p_limit
 ) update private.retired_article_ids r set claim_token=gen_random_uuid(),claim_until=clock_timestamp()+interval '5 minutes',last_attempt_at=clock_timestamp()
  from candidates c where r.article_id=c.article_id returning r.article_id,r.scan_offset,r.claim_token;
end $$;
