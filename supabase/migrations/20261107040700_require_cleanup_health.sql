create or replace function public.delete_archived_article(p_article_id uuid,p_expected_version integer,p_request_id uuid,p_confirm boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_profile uuid; article public.articles%rowtype;
  receipt private.article_deletion_receipts%rowtype; home_version integer; selected boolean;
begin
  if p_article_id is null or p_expected_version is null or p_expected_version<1
    or p_request_id is null or p_confirm is distinct from true then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  actor_profile:=private.lock_draft_actor();
  if actor_profile is null or not private.is_active_administrator() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  select * into receipt from private.article_deletion_receipts where actor_user_id=actor and request_id=p_request_id;
  if found then
    if receipt.article_id<>p_article_id or receipt.expected_version<>p_expected_version then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_build_object('ok',true,'articleId',p_article_id,'replayed',true);
  end if;
  if not exists(select 1 from private.media_cleanup_runtime where id=true and last_healthy_at>clock_timestamp()-interval '48 hours') then
    return '{"ok":false,"code":"cleanup_unavailable"}'::jsonb; end if;
  select edit_version into home_version from public.homepage_curation
    where id='00000000-0000-0000-0000-000000000001'::uuid for update;
  select * into article from public.articles where id=p_article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.status<>'archived' or article.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  -- The existing finalizer takes an asset lock first. Fail promptly instead of deadlocking.
  perform id from public.media_assets where article_id=p_article_id order by id for update nowait;
  selected:=exists(select 1 from public.homepage_selections where article_id=p_article_id);
  if selected and home_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261102::bigint);
  insert into private.retired_article_slugs(slug) values(article.slug) on conflict do nothing;
  if selected then
    delete from public.homepage_selections where article_id=p_article_id;
    update public.homepage_curation set edit_version=edit_version+1
      where id='00000000-0000-0000-0000-000000000001'::uuid;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'homepage.updated','homepage','00000000-0000-0000-0000-000000000001'::uuid,p_request_id);
  end if;
  delete from public.article_categories where article_id=p_article_id;
  delete from public.article_tags where article_id=p_article_id;
  delete from public.article_contributors where article_id=p_article_id;
  delete from public.article_body_images where article_id=p_article_id;
  delete from public.article_main_images where article_id=p_article_id;
  delete from public.article_revisions where article_id=p_article_id;
  delete from public.media_assets where article_id=p_article_id;
  insert into private.retired_article_ids(article_id) values(p_article_id) on conflict do nothing;
  delete from public.articles where id=p_article_id;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,'article.deleted','article',p_article_id,p_request_id);
  insert into private.article_deletion_receipts(actor_user_id,request_id,article_id,expected_version)
    values(actor,p_request_id,p_article_id,p_expected_version);
  return pg_catalog.jsonb_build_object('ok',true,'articleId',p_article_id,'replayed',false);
exception when others then
  raise log 'archived deletion failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
