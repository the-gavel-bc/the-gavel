alter table private.media_cleanup_ledger add column last_succeeded boolean;
alter table private.retired_article_ids add column last_succeeded boolean;
create table private.media_cleanup_runtime (id boolean primary key default true check(id),last_healthy_at timestamptz);
insert into private.media_cleanup_runtime(id) values(true);
revoke all on private.media_cleanup_runtime from public,anon,authenticated;
create function public.record_media_cleanup_health(p_success boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_success is distinct from true then return false; end if;
 update private.media_cleanup_runtime set last_healthy_at=clock_timestamp() where id=true;
 return found;
end $$;
revoke all on function public.record_media_cleanup_health(boolean) from public,anon,authenticated;
grant execute on function public.record_media_cleanup_health(boolean) to service_role;
create or replace function public.finish_media_cleanup(p_object_key text,p_claim_token uuid,p_success boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if p_object_key is null or p_claim_token is null or p_success is null then return false; end if;
 update private.media_cleanup_ledger l set last_succeeded_at=case when p_success then clock_timestamp() else l.last_succeeded_at end,
  last_succeeded=p_success,claim_token=null,claim_until=null where l.object_key=p_object_key and l.claim_token=p_claim_token and l.claim_until>=clock_timestamp();
 return found;
end $$;
create or replace function public.finish_retired_article_scan(p_article_id uuid,p_claim_token uuid,p_count integer,p_success boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if p_article_id is null or p_claim_token is null or p_count is null or p_count not between 0 and 100 or p_success is null then return false; end if;
 update private.retired_article_ids r set last_succeeded=p_success,
  scan_offset=case when not p_success then r.scan_offset when p_count<100 or r.scan_offset>2147483547 then 0 else r.scan_offset+100 end,
  claim_token=null,claim_until=null where r.article_id=p_article_id and r.claim_token=p_claim_token and r.claim_until>=clock_timestamp();
 return found;
end $$;
