alter table private.retired_article_ids add column cycle_has_error boolean not null default false;
create function public.finish_retired_article_scan_v2(p_article_id uuid,p_claim_token uuid,p_count integer,p_page_read boolean,p_clean boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if p_article_id is null or p_claim_token is null or p_count is null or p_count not between 0 and 100
   or p_page_read is null or p_clean is null then return false; end if;
 update private.retired_article_ids r set
  last_succeeded=case when not p_page_read or not p_clean then false
   when p_count<100 or r.scan_offset>2147483547 then not r.cycle_has_error
   else r.last_succeeded end,
  cycle_has_error=case when p_page_read and (p_count<100 or r.scan_offset>2147483547) then false
   else r.cycle_has_error or not p_clean end,
  scan_offset=case when not p_page_read then r.scan_offset when p_count<100 or r.scan_offset>2147483547 then 0 else r.scan_offset+100 end,
  claim_token=null,claim_until=null where r.article_id=p_article_id and r.claim_token=p_claim_token and r.claim_until>=clock_timestamp();
 return found;
end $$;
revoke all on function public.finish_retired_article_scan_v2(uuid,uuid,integer,boolean,boolean) from public,anon,authenticated;
grant execute on function public.finish_retired_article_scan_v2(uuid,uuid,integer,boolean,boolean) to service_role;
