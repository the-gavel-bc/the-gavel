-- Admission commits before multipart buffering/decoding, independently of draft saves.
create table private.upload_processing_limits (
  actor_user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 30)
);
alter table private.upload_processing_limits enable row level security;
revoke all on private.upload_processing_limits from public,anon,authenticated,service_role;

create function public.admit_article_image_upload(p_article_id uuid,p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_profile uuid; asset public.media_assets%rowtype; article public.articles%rowtype;
  current_window timestamptz; attempts integer; checked_at timestamptz;
begin
  actor_profile:=private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_asset_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  -- Retain caller/article authority during admission. Asset state is a plain
  -- snapshot read: taking an asset lock here could invert finalization locks.
  -- The existing begin/finalize operations recheck asset state after decoding.
  select * into article from public.articles where id=p_article_id for share;
  if not found or (article.owner_profile_id<>actor_profile and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id and article_id=p_article_id;
  if not found or (asset.uploader_user_id<>auth.uid() and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if asset.status='finalized' then return '{"ok":true,"replayed":true}'::jsonb; end if;
  if article.status<>'draft' or asset.status not in ('pending','uploading') then
    return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  insert into private.upload_processing_limits(actor_user_id) values(auth.uid()) on conflict do nothing;
  select window_start,attempt_count into current_window,attempts from private.upload_processing_limits
    where actor_user_id=auth.uid() for update;
  checked_at:=clock_timestamp();
  if checked_at>=current_window+interval '60 seconds' then
    update private.upload_processing_limits set window_start=checked_at,attempt_count=1 where actor_user_id=auth.uid();
  elsif attempts>=30 then
    return jsonb_build_object('ok',false,'code','rate_limited','retryAfter',least(60,greatest(1,ceil(extract(epoch from current_window+interval '60 seconds'-checked_at))::integer)));
  else
    update private.upload_processing_limits set attempt_count=attempt_count+1 where actor_user_id=auth.uid();
  end if;
  return '{"ok":true,"replayed":false}'::jsonb;
end;
$$;
revoke all on function public.admit_article_image_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admit_article_image_upload(uuid,uuid) to authenticated;
