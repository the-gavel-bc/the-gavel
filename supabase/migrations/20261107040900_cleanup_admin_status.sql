create or replace function public.get_media_cleanup_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_administrator() or not exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active)
  then raise exception 'Administrator access required' using errcode='42501'; end if;
 return jsonb_build_object('keys',(select count(*) from private.media_cleanup_ledger),
  'prefixes',(select count(*) from private.retired_article_ids),
  'unattempted',(select count(*) from private.media_cleanup_ledger where last_attempt_at is null),
  'failedKeys',(select count(*) from private.media_cleanup_ledger where last_succeeded=false),
  'failedPrefixes',(select count(*) from private.retired_article_ids where last_succeeded=false),
  'lastHealthyAt',(select last_healthy_at from private.media_cleanup_runtime where id=true));
end $$;
