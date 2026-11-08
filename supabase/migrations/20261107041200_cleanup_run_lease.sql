alter table private.media_cleanup_runtime add column run_token uuid, add column run_until timestamptz;
alter table private.media_cleanup_ledger add column created_at timestamptz not null default now();
alter table private.retired_article_ids add column created_at timestamptz not null default now();
-- A run invalidates readiness before doing any external work. Crashes therefore fail closed.
create function public.start_media_cleanup_run() returns uuid language plpgsql volatile security definer set search_path='' as $$
declare token uuid;
begin
 update private.media_cleanup_runtime set run_token=gen_random_uuid(),run_until=clock_timestamp()+interval '10 minutes',last_healthy_at=null
  where id=true and (run_until is null or run_until<clock_timestamp()) returning run_token into token;
 return token;
end $$;
create function public.finish_media_cleanup_run(p_token uuid,p_success boolean) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if p_token is null or p_success is null then return false; end if;
 update private.media_cleanup_runtime set last_healthy_at=case when p_success then clock_timestamp() else null end,
  run_token=null,run_until=null where id=true and run_token=p_token and run_until>=clock_timestamp();
 return found;
end $$;
create function public.get_media_cleanup_backlog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('staleKeys',(select count(*) from private.media_cleanup_ledger where coalesce(last_attempt_at,created_at)<clock_timestamp()-interval '7 days' or last_succeeded=false),
  'stalePrefixes',(select count(*) from private.retired_article_ids where coalesce(last_attempt_at,created_at)<clock_timestamp()-interval '7 days' or last_succeeded=false));
$$;
revoke all on function public.start_media_cleanup_run(),public.finish_media_cleanup_run(uuid,boolean),public.get_media_cleanup_backlog() from public,anon,authenticated;
revoke execute on function public.record_media_cleanup_health(boolean) from service_role;
grant execute on function public.start_media_cleanup_run(),public.finish_media_cleanup_run(uuid,boolean),public.get_media_cleanup_backlog() to service_role;
create or replace function public.get_media_cleanup_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_administrator() or not exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active)
  then raise exception 'Administrator access required' using errcode='42501'; end if;
 return jsonb_build_object('keys',(select count(*) from private.media_cleanup_ledger),
  'prefixes',(select count(*) from private.retired_article_ids),
  'unattempted',(select count(*) from private.media_cleanup_ledger where last_attempt_at is null),
  'failedKeys',(select count(*) from private.media_cleanup_ledger where last_succeeded=false),
  'failedPrefixes',(select count(*) from private.retired_article_ids where last_succeeded=false),
  'oldestKeyCheck',(select min(coalesce(last_attempt_at,created_at)) from private.media_cleanup_ledger),
  'oldestPrefixCheck',(select min(coalesce(last_attempt_at,created_at)) from private.retired_article_ids),
  'lastHealthyAt',(select last_healthy_at from private.media_cleanup_runtime where id=true));
end $$;
