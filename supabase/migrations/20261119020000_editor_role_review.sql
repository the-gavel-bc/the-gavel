-- Editor role and review workflow. Authors write and submit; editors copy-edit
-- and publish; administrators keep every ability. Review state is a pair of
-- columns on drafts rather than a fourth article status, so every published-only
-- public boundary stays untouched. See docs/superpowers/plans/2026-11-19-editor-role.md.

alter table public.articles
  add column review_requested_at timestamptz,
  add column review_note text check (review_note is null
    or (review_note = btrim(review_note) and char_length(review_note) between 1 and 500)),
  add column published_by_profile_id uuid references public.profiles(id);
grant select (review_requested_at, review_note) on public.articles to authenticated;
create index articles_review_queue_idx on public.articles (review_requested_at)
  where status = 'draft' and review_requested_at is not null;

alter table public.audit_events drop constraint audit_events_action_resource_check;
alter table public.audit_events add constraint audit_events_action_resource_check check (
  (resource_type = 'article' and action in ('article.created','article.updated','article.published',
    'article.archived','article.restored','article.deleted','article.owner_changed',
    'article.submitted','article.returned'))
  or (resource_type = 'membership' and action in ('membership.approved','membership.role_changed',
    'membership.deactivated','membership.invited','membership.invitation_changed',
    'membership.invitation_removed','membership.claimed'))
  or (resource_type = 'profile' and action in ('profile.created','profile.updated','profile.deactivated'))
  or (resource_type = 'section' and action in ('section.updated','section.created','section.deleted'))
  or (resource_type = 'category' and action in ('category.updated','category.created','category.deleted'))
  or (resource_type = 'homepage' and action = 'homepage.updated')
  or (resource_type = 'site_information' and action = 'site_information.updated')
  or (resource_type = 'tag' and action in ('tag.renamed','tag.merged','tag.deleted'))
);

alter table private.draft_write_receipts drop constraint draft_write_receipts_operation_check;
alter table private.draft_write_receipts add constraint draft_write_receipts_operation_check
  check (operation in ('create','save','save_published','publish','archive','restore','submit','return'));
alter table private.draft_write_receipts drop constraint draft_write_receipts_check;
alter table private.draft_write_receipts add constraint draft_write_receipts_check
  check ((operation='create' and expected_version is null)
    or (operation in ('save','save_published','publish','archive','restore','submit','return')
      and expected_version >= 1 and expected_version is not null));

-- One authority predicate for every article operation. It checks the claimed
-- user's active membership and profile; callers have already proven eligibility.
create function private.article_authority(p_article_id uuid, p_user_id uuid, p_mode text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.articles a
    join public.memberships m on m.user_id = p_user_id and m.active
    join public.profiles me on me.auth_user_id = p_user_id and me.active
    where a.id = p_article_id
      and case p_mode
        -- Change content or media: authors only while it is theirs and unsubmitted;
        -- editors only while in review; administrators always.
        when 'edit' then m.role = 'administrator'
          or (a.status = 'draft' and (
            (a.owner_profile_id = me.id and a.review_requested_at is null)
            or (m.role = 'editor' and a.review_requested_at is not null)))
        when 'read' then m.role = 'administrator' or a.owner_profile_id = me.id
          or (m.role = 'editor' and (a.review_requested_at is not null or a.published_by_profile_id = me.id))
        when 'replay' then m.role in ('administrator', 'editor') or a.owner_profile_id = me.id
        when 'submit' then a.owner_profile_id = me.id
        when 'review' then m.role in ('administrator', 'editor')
        when 'publish' then m.role = 'administrator'
          or (m.role = 'editor' and (a.owner_profile_id = me.id or a.review_requested_at is not null))
        when 'archive' then m.role = 'administrator'
          or (m.role = 'editor' and a.published_by_profile_id = me.id)
        else false end
  );
$$;
revoke all on function private.article_authority(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.can_read_article(check_article_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.has_eligible_identity()
    and private.article_authority(check_article_id, auth.uid(), 'read');
$$;

CREATE OR REPLACE FUNCTION public.save_article_draft(p_article_id uuid, p_expected_version integer, p_request_id uuid, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  actor uuid := auth.uid(); actor_profile uuid; checked jsonb; draft jsonb; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; current_article public.articles%rowtype;
  snapshot jsonb; stored_input jsonb; changed boolean; committed_version integer;
  committed_at timestamptz; failed_constraint text; legacy_checked jsonb; candidate_slug text;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  checked := private.check_draft_input(p_draft);
  select * into receipt from private.draft_write_receipts where actor_user_id=actor and request_id=p_request_id;
  if receipt.request_id is not null and p_draft ? 'slug' and p_article_id is not null and p_expected_version >= 1 then
    legacy_checked := private.check_draft_input_with_slug(p_draft);
    if legacy_checked ->> 'ok'='true' then
      fingerprint := private.draft_request_hash('save',p_article_id,p_expected_version,legacy_checked -> 'value');
      if receipt.operation='save' and receipt.payload_hash=fingerprint then
        select * into current_article from public.articles where id=p_article_id
          and private.article_authority(id,auth.uid(),'edit') for update;
        if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
        return jsonb_build_object('ok',true,'articleId',receipt.article_id,'version',receipt.result_version,
          'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
      end if;
    end if;
  end if;
  if checked ->> 'ok'='true' and p_article_id is not null and p_expected_version >= 1 then
    draft := checked -> 'value';
    fingerprint := private.draft_request_hash('save',p_article_id,p_expected_version,draft);
    if receipt.request_id is not null and receipt.operation='save' and receipt.payload_hash=fingerprint then
      select * into current_article from public.articles where id=p_article_id
        and private.article_authority(id,auth.uid(),'edit') for update;
      if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
      -- Replays return an old committed result, never rewrite later content/status.
      return jsonb_build_object('ok',true,'articleId',receipt.article_id,'version',receipt.result_version,
        'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
    end if;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 1 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if receipt.request_id is not null then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
  if checked ->> 'ok' <> 'true' then return checked; end if;
  select * into current_article from public.articles where id=p_article_id
    and private.article_authority(id,auth.uid(),'edit') for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if current_article.status <> 'draft' then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if not private.is_valid_draft_document(current_article.content) then return '{"ok":false,"code":"unsupported_content"}'::jsonb; end if;
  if current_article.edit_version <> p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if not private.check_draft_references(draft) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if not private.check_body_image_assets(p_article_id,nullif(draft->'content','null'::jsonb)) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  candidate_slug := private.allocate_article_slug(draft ->> 'title',p_article_id);
  if candidate_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  snapshot := private.capture_draft_snapshot(p_article_id);
  stored_input := (snapshot -> 'article') - array['id','ownerProfileId','status','publishedAt','archivedAt','createdAt','updatedAt','editVersion','slug']
    || jsonb_build_object('schemaVersion',1,'categoryIds',snapshot -> 'categoryIds','tagIds',snapshot -> 'tagIds','contributors',snapshot -> 'contributors');
  changed := stored_input <> draft or current_article.slug <> candidate_slug;
  if changed and current_article.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  committed_version := current_article.edit_version; committed_at := current_article.updated_at;
  begin
    if changed then
      -- Clear links before changing section so composite FKs remain valid throughout.
      delete from public.article_categories where article_id=p_article_id;
      delete from public.article_tags where article_id=p_article_id;
      delete from public.article_contributors where article_id=p_article_id;
      update public.articles set section_id=(draft ->> 'sectionId')::uuid,title=draft ->> 'title',slug=candidate_slug,
        excerpt=draft ->> 'excerpt',content=nullif(draft -> 'content','null'::jsonb),seo_keyphrase=draft ->> 'seoKeyphrase',
        meta_description=draft ->> 'metaDescription',edit_version=edit_version+1 where id=p_article_id
        returning edit_version,updated_at into committed_version,committed_at;
      insert into public.article_categories(article_id,category_id,section_id)
        select p_article_id,value::uuid,(draft ->> 'sectionId')::uuid from jsonb_array_elements_text(draft -> 'categoryIds');
      insert into public.article_tags(article_id,tag_id)
        select p_article_id,value::uuid from jsonb_array_elements_text(draft -> 'tagIds');
      insert into public.article_contributors(article_id,profile_id,contribution_role,display_order)
        select p_article_id,(value ->> 'profileId')::uuid,(value ->> 'role')::public.contribution_role,
          (value ->> 'displayOrder')::integer from jsonb_array_elements(draft -> 'contributors');
      perform private.replace_body_image_refs(p_article_id,nullif(draft->'content','null'::jsonb));
      insert into public.article_revisions(article_id,actor_user_id,snapshot)
        values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
        values(actor,'article.updated','article',p_article_id,p_request_id);
    end if;
    insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,expected_version,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,'save',p_article_id,p_expected_version,fingerprint,committed_version,committed_at,changed);
  exception when unique_violation then
    get stacked diagnostics failed_constraint=constraint_name;
    if failed_constraint='articles_slug_key' then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
    raise log 'draft save failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  when others then
    raise log 'draft save failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'version',committed_version,
    'updatedAt',committed_at,'replayed',false,'changed',changed);
exception when others then
  raise log 'draft save failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_published_article(p_article_id uuid, p_expected_version integer, p_request_id uuid, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  actor uuid := auth.uid(); actor_profile uuid; checked jsonb; draft jsonb; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; current_article public.articles%rowtype;
  snapshot jsonb; stored_input jsonb; changed boolean; committed_version integer;
  committed_at timestamptz;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  checked := private.check_draft_input(p_draft);
  select * into receipt from private.draft_write_receipts
    where actor_user_id=actor and request_id=p_request_id;
  if checked->>'ok'='true' and p_article_id is not null and p_expected_version >= 1 then
    draft := checked->'value';
    fingerprint := private.draft_request_hash('save_published',p_article_id,p_expected_version,draft);
    if receipt.request_id is not null and receipt.operation='save_published'
      and receipt.payload_hash=fingerprint then
      select * into current_article from public.articles where id=p_article_id
        and private.article_authority(id,auth.uid(),'edit') for update;
      if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
      return jsonb_build_object('ok',true,'articleId',receipt.article_id,'version',receipt.result_version,
        'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
    end if;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 1 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if receipt.request_id is not null then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
  if checked->>'ok'<>'true' then return checked; end if;
  select * into current_article from public.articles where id=p_article_id
    and private.article_authority(id,auth.uid(),'edit') for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if current_article.status<>'published' then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if not private.is_valid_draft_document(current_article.content) then
    return '{"ok":false,"code":"unsupported_content"}'::jsonb; end if;
  if current_article.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  snapshot := private.capture_draft_snapshot(p_article_id);
  stored_input := (snapshot->'article') - array[
    'id','ownerProfileId','status','publishedAt','archivedAt','createdAt','updatedAt','editVersion','slug'
  ] || jsonb_build_object('schemaVersion',1,'categoryIds',snapshot->'categoryIds',
    'tagIds',snapshot->'tagIds','contributors',snapshot->'contributors');
  changed := stored_input<>draft;
  if changed and current_article.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if changed and not private.is_publication_ready(p_article_id,draft) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  committed_version := current_article.edit_version; committed_at := current_article.updated_at;
  begin
    if changed then
      delete from public.article_categories where article_id=p_article_id;
      delete from public.article_tags where article_id=p_article_id;
      delete from public.article_contributors where article_id=p_article_id;
      update public.articles set section_id=(draft->>'sectionId')::uuid,title=draft->>'title',
        excerpt=draft->>'excerpt',content=draft->'content',seo_keyphrase=draft->>'seoKeyphrase',
        meta_description=draft->>'metaDescription',edit_version=edit_version+1 where id=p_article_id
        returning edit_version,updated_at into committed_version,committed_at;
      insert into public.article_categories(article_id,category_id,section_id)
        select p_article_id,value::uuid,(draft->>'sectionId')::uuid from jsonb_array_elements_text(draft->'categoryIds');
      insert into public.article_tags(article_id,tag_id)
        select p_article_id,value::uuid from jsonb_array_elements_text(draft->'tagIds');
      insert into public.article_contributors(article_id,profile_id,contribution_role,display_order)
        select p_article_id,(value->>'profileId')::uuid,(value->>'role')::public.contribution_role,
          (value->>'displayOrder')::integer from jsonb_array_elements(draft->'contributors');
      perform private.replace_body_image_refs(p_article_id,draft->'content');
      insert into public.article_revisions(article_id,actor_user_id,snapshot)
        values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
        values(actor,'article.updated','article',p_article_id,p_request_id);
    end if;
    insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,
      expected_version,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,'save_published',p_article_id,p_expected_version,
        fingerprint,committed_version,committed_at,changed);
  exception when others then
    raise log 'published save failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'version',committed_version,
    'updatedAt',committed_at,'replayed',false,'changed',changed);
exception when others then
  raise log 'published save failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_article_image_upload(p_article_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); actor_profile uuid; target public.articles%rowtype;
  previous public.media_assets%rowtype; asset_id uuid;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select * into target from public.articles where id=p_article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if not private.article_authority(target.id,auth.uid(),'edit') then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if target.status not in ('draft','published') then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  select * into previous from public.media_assets where uploader_user_id=actor and request_id=p_request_id;
  if found then
    if previous.article_id <> p_article_id then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    if previous.status='deleting' then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    return jsonb_build_object('ok',true,'assetId',previous.id,'status',previous.status,'replayed',true);
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  asset_id := gen_random_uuid();
  insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key)
    values(asset_id,p_article_id,actor,p_request_id,p_article_id::text||'/'||asset_id::text||'.webp');
  return jsonb_build_object('ok',true,'assetId',asset_id,'status','pending','replayed',false);
exception when unique_violation then
  return '{"ok":false,"code":"request_conflict"}'::jsonb;
when others then
  raise log 'media reservation failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_article_image_for_removal(p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_profile uuid; asset public.media_assets%rowtype;
  article public.articles%rowtype;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_asset_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id=asset.article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if not private.article_authority(article.id,auth.uid(),'edit') then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if not found or asset.article_id<>article.id then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.status not in ('draft','published') then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if exists(select 1 from public.article_body_images where asset_id=p_asset_id)
    or exists(select 1 from public.article_main_images where asset_id=p_asset_id)
    or exists(select 1 from private.article_revision_media_refs r
      where r.asset_id=p_asset_id) then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if asset.status='deleting' then
    return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',true);
  end if;
  update public.media_assets set status='deleting' where id=p_asset_id;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',false);
exception when others then
  raise log 'media removal mark failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admit_article_image_upload(p_article_id uuid, p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not found or (not private.article_authority(article.id,auth.uid(),'edit')) then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id and article_id=p_article_id;
  if not found or (asset.uploader_user_id<>auth.uid() and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.status not in ('draft','published') then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if asset.status='finalized' then return '{"ok":true,"replayed":true}'::jsonb; end if;
  if asset.status not in ('pending','uploading') then
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
$function$;

CREATE OR REPLACE FUNCTION public.list_unused_article_uploads(p_article_id uuid, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_profile uuid; article public.articles%rowtype; items jsonb; more boolean;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_limit is null or p_limit < 1 or p_limit > 50 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  select * into article from public.articles where id=p_article_id for share;
  if not found or (not private.article_authority(article.id,auth.uid(),'edit')) then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if article.status not in ('draft','published') then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  with candidates as materialized (
    select a.id,a.created_at,a.status from public.media_assets a
    where a.article_id=p_article_id and a.status in ('finalized','deleting')
      and (p_after_id is null or a.id>p_after_id)
      and not exists(select 1 from public.article_body_images r where r.asset_id=a.id)
      and not exists(select 1 from public.article_main_images r where r.asset_id=a.id)
      and not exists(select 1 from private.article_revision_media_refs r where r.asset_id=a.id)
    order by a.id limit p_limit+1
  ), page as (select * from candidates order by id limit p_limit)
  select coalesce((select jsonb_agg(jsonb_build_object('assetId',id,'createdAt',created_at,'status',status) order by id) from page),'[]'::jsonb),
    (select count(*)>p_limit from candidates) into items,more;
  return jsonb_build_object('ok',true,'items',items,'nextCursor',
    case when more then items->-1->>'assetId' else null end);
exception when others then
  raise log 'unused media listing failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_article_main_image(p_article_id uuid, p_expected_version integer, p_request_id uuid, p_asset_id uuid, p_alt_text text, p_credit text, p_caption text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare actor uuid := auth.uid(); actor_profile uuid; article public.articles%rowtype;
  receipt private.media_write_receipts%rowtype; image public.article_main_images%rowtype;
  asset public.media_assets%rowtype; fingerprint bytea; changed boolean;
  committed_version integer; committed_at timestamptz; legacy_fingerprint bytea;
begin
  p_caption := nullif(regexp_replace(p_caption,'^[[:space:]]+|[[:space:]]+$','','g'),'');
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 1
    or (p_asset_id is null and (p_alt_text is not null or p_credit is not null or p_caption is not null))
    or (p_asset_id is not null and (
      p_alt_text is null or char_length(p_alt_text) not between 1 and 240
      or p_alt_text ~ '(^[[:space:]]|[[:space:]]$)'
      or p_credit is null or char_length(p_credit) not between 1 and 240
      or p_credit ~ '(^[[:space:]]|[[:space:]]$)'
      or (p_caption is not null and (char_length(p_caption) not between 1 and 400
        or p_caption ~ '(^[[:space:]]|[[:space:]]$)'))
    )) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  legacy_fingerprint := sha256(convert_to(jsonb_build_object(
    'articleId',p_article_id,'expectedVersion',p_expected_version,'assetId',p_asset_id,
    'altText',p_alt_text,'credit',p_credit)::text,'UTF8'));
  fingerprint := sha256(convert_to(jsonb_build_object(
    'articleId',p_article_id,'expectedVersion',p_expected_version,'assetId',p_asset_id,
    'altText',p_alt_text,'credit',p_credit,'caption',p_caption)::text,'UTF8'));
  select * into article from public.articles where id=p_article_id for update;
  if not found or (not private.article_authority(article.id,auth.uid(),'edit')) then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into receipt from private.media_write_receipts where actor_user_id=actor and request_id=p_request_id;
  if found then
    if receipt.article_id=p_article_id and (receipt.payload_hash=fingerprint or
      (p_caption is null and receipt.payload_hash=legacy_fingerprint)) then
      return jsonb_build_object('ok',true,'articleId',p_article_id,'version',receipt.result_version,
        'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
    end if;
    return '{"ok":false,"code":"request_conflict"}'::jsonb;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if article.status not in ('draft','published') or article.edit_version<>p_expected_version then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if p_asset_id is not null then
    select * into asset from public.media_assets where id=p_asset_id for share;
    if not found or asset.article_id<>p_article_id or asset.status<>'finalized' then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
  end if;
  select * into image from public.article_main_images where article_id=p_article_id;
  changed := case when p_asset_id is null then image.asset_id is not null
    else image.asset_id is distinct from p_asset_id
      or image.alt_text is distinct from p_alt_text or image.credit is distinct from p_credit
      or image.caption is distinct from p_caption end;
  if changed and article.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  committed_version := article.edit_version;
  committed_at := article.updated_at;
  begin
    if changed then
      if p_asset_id is null then
        delete from public.article_main_images where article_id=p_article_id;
      else
        insert into public.article_main_images(article_id,asset_id,alt_text,credit,caption)
          values(p_article_id,p_asset_id,p_alt_text,p_credit,p_caption)
          on conflict (article_id) do update set asset_id=excluded.asset_id,
            alt_text=excluded.alt_text,credit=excluded.credit,caption=excluded.caption;
      end if;
      update public.articles set edit_version=edit_version+1 where id=p_article_id
        returning edit_version,updated_at into committed_version,committed_at;
      insert into public.article_revisions(article_id,actor_user_id,snapshot)
        values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
        values(actor,'article.updated','article',p_article_id,p_request_id);
    end if;
    insert into private.media_write_receipts(actor_user_id,request_id,article_id,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,p_article_id,fingerprint,committed_version,committed_at,changed);
  exception when others then
    raise log 'main image write failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'version',committed_version,
    'updatedAt',committed_at,'replayed',false,'changed',changed);
exception when others then
  raise log 'main image write failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_article_image_upload(p_actor_user_id uuid, p_asset_id uuid, p_sha256 text, p_byte_size integer, p_width integer, p_height integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare asset public.media_assets%rowtype; article public.articles%rowtype;
  actor_profile uuid; actor_admin boolean; object_metadata jsonb; locator_article_id uuid;
begin
  actor_profile := private.lock_media_actor(p_actor_user_id);
  if actor_profile is null then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id,m.role='administrator' into actor_profile,actor_admin
    from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=p_actor_user_id and p.active and m.active;
  -- Locate without a row lock, then match begin/removal ordering: article before asset.
  select a.article_id into locator_article_id from public.media_assets a where a.id=p_asset_id;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id=locator_article_id for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  -- Either row can disappear while waiting; never trust the unlocked locator.
  if not found or asset.article_id<>article.id then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if asset.uploader_user_id<>p_actor_user_id and not actor_admin then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if not private.article_authority(article.id,p_actor_user_id,'edit') then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  if article.status not in ('draft','published') or asset.status='deleting' then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if asset.status='finalized' then
    if asset.sha256=p_sha256 and asset.byte_size=p_byte_size
      and asset.width=p_width and asset.height=p_height then
      return jsonb_build_object('ok',true,'assetId',asset.id,'replayed',true);
    end if;
    return '{"ok":false,"code":"request_conflict"}'::jsonb;
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_byte_size not between 1 and 10485760
    or p_width not between 1 and 6000 or p_height not between 1 and 6000
    or p_width::bigint*p_height>24000000 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  select metadata into object_metadata from storage.objects
    where bucket_id='article-media' and name=asset.object_key;
  if object_metadata is null
    or object_metadata ->> 'mimetype' <> 'image/webp'
    or object_metadata ->> 'size' <> p_byte_size::text then
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end if;
  update public.media_assets set status='finalized',sha256=p_sha256,
    byte_size=p_byte_size,width=p_width,height=p_height,finalized_at=now()
    where id=p_asset_id;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',false);
exception when others then
  raise log 'media finalization failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_article_image_removal(p_actor_user_id uuid, p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_profile uuid; actor_admin boolean; asset public.media_assets%rowtype;
  article public.articles%rowtype;
begin
  actor_profile := private.lock_media_actor(p_actor_user_id);
  if actor_profile is null then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id,m.role='administrator' into actor_profile,actor_admin
    from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=p_actor_user_id and p.active and m.active;
  select * into asset from public.media_assets where id=p_asset_id;
  if not found then return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',true); end if;
  select * into article from public.articles where id=asset.article_id for update;
  if not private.article_authority(article.id,p_actor_user_id,'edit') then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if asset.status<>'deleting' or exists(
    select 1 from public.article_body_images where asset_id=p_asset_id
  ) or exists(
    select 1 from public.article_main_images where asset_id=p_asset_id
  ) or exists(select 1 from private.article_revision_media_refs r
    where r.asset_id=p_asset_id)
  then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if exists(select 1 from storage.objects where bucket_id='article-media' and name=asset.object_key) then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  delete from public.media_assets where id=p_asset_id;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,'replayed',false);
exception when others then
  raise log 'media removal completion failed state=%',sqlstate;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.begin_article_image_upload(p_actor_user_id uuid, p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_profile uuid; actor_admin boolean; asset public.media_assets%rowtype;
  article public.articles%rowtype;
begin
  actor_profile := private.lock_media_actor(p_actor_user_id);
  if actor_profile is null then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id,m.role='administrator' into actor_profile,actor_admin
    from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=p_actor_user_id and p.active and m.active;
  select * into asset from public.media_assets where id=p_asset_id;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  select * into article from public.articles where id=asset.article_id for update;
  if not private.article_authority(article.id,p_actor_user_id,'edit') then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into asset from public.media_assets where id=p_asset_id for update;
  if article.status not in ('draft','published') or (asset.uploader_user_id<>p_actor_user_id and not actor_admin)
    or asset.status not in ('pending','uploading') then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if asset.status='pending' then
    update public.media_assets set status='uploading' where id=p_asset_id;
  end if;
  return jsonb_build_object('ok',true,'assetId',p_asset_id,
    'replayed',asset.status='uploading');
end;
$function$;

-- Lifecycle: submit and return join publish/archive/restore.
drop function private.transition_article(uuid, integer, uuid, text);
create function private.transition_article(
  p_article_id uuid, p_expected_version integer, p_request_id uuid, p_operation text,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  actor uuid := auth.uid(); actor_profile uuid; fingerprint bytea; note text := btrim(p_note);
  receipt private.draft_write_receipts%rowtype; article public.articles%rowtype;
  snapshot jsonb; current_input jsonb; checked jsonb;
  committed_version integer; committed_at timestamptz; result_status text; mode text;
begin
  if p_operation not in ('submit','return','publish','archive','restore') then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_operation='restore' and not private.is_active_administrator() then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null
    or p_expected_version < 1 then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if p_operation='return' and (note is null or char_length(note) not between 1 and 500) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  mode := case p_operation when 'submit' then 'submit' when 'return' then 'review'
    when 'publish' then 'publish' else 'archive' end;
  fingerprint := private.draft_request_hash(
    case when p_operation='return' then 'return:'||note else p_operation end,
    p_article_id,p_expected_version,'{}'::jsonb);
  select * into receipt from private.draft_write_receipts
    where actor_user_id=actor and request_id=p_request_id;
  result_status := case p_operation when 'archive' then 'archived'
    when 'submit' then 'draft' when 'return' then 'draft' else 'published' end;
  if receipt.request_id is not null and receipt.operation=p_operation
    and receipt.payload_hash=fingerprint then
    select * into article from public.articles where id=p_article_id
      and private.article_authority(id,actor,'replay') for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    return jsonb_build_object('ok',true,'articleId',receipt.article_id,
      'status',result_status,'version',receipt.result_version,
      'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if receipt.request_id is not null then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
  select * into article from public.articles where id=p_article_id
    and case when p_operation='restore' then true
      else private.article_authority(id,actor,mode) end for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.edit_version<>p_expected_version or article.edit_version=2147483647
    or (p_operation='submit' and (article.status<>'draft' or article.review_requested_at is not null))
    or (p_operation='return' and (article.status<>'draft' or article.review_requested_at is null))
    or (p_operation='publish' and article.status<>'draft')
    or (p_operation='archive' and article.status<>'published')
    or (p_operation='restore' and article.status<>'archived') then
    return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if p_operation in ('submit','publish','restore') then
    snapshot := private.capture_draft_snapshot(p_article_id);
    current_input := (snapshot->'article') - array[
      'id','ownerProfileId','status','publishedAt','archivedAt','createdAt','updatedAt','editVersion','slug'
    ] || jsonb_build_object('schemaVersion',1,'categoryIds',snapshot->'categoryIds',
      'tagIds',snapshot->'tagIds','contributors',snapshot->'contributors');
    checked := private.check_draft_input(current_input);
    if checked->>'ok'<>'true' then return checked; end if;
    if not private.is_publication_ready(p_article_id,checked->'value') then
      return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  end if;
  begin
    if p_operation='submit' then
      update public.articles set review_requested_at=now(),review_note=null,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    elsif p_operation='return' then
      update public.articles set review_requested_at=null,review_note=note,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    elsif p_operation='publish' then
      update public.articles set status='published',published_at=now(),review_note=null,
        published_by_profile_id=actor_profile,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    elsif p_operation='archive' then
      update public.articles set status='archived',archived_at=now(),edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    else
      update public.articles set status='published',archived_at=null,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    end if;
    insert into public.article_revisions(article_id,actor_user_id,snapshot)
      values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'article.'||case p_operation when 'submit' then 'submitted' when 'return' then 'returned'
        when 'publish' then 'published' when 'archive' then 'archived' else 'restored' end,
        'article',p_article_id,p_request_id);
    insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,
      expected_version,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,p_operation,p_article_id,p_expected_version,
        fingerprint,committed_version,committed_at,true);
  exception when others then
    raise log 'article transition failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'status',result_status,
    'version',committed_version,'updatedAt',committed_at,'replayed',false,'changed',true);
exception when others then
  raise log 'article transition failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
revoke all on function private.transition_article(uuid,integer,uuid,text,text) from public,anon,authenticated;

create function public.submit_article(p_article_id uuid,p_expected_version integer,p_request_id uuid)
returns jsonb language sql security definer set search_path = '' set timezone = 'UTC' as $$
  select private.transition_article(p_article_id,p_expected_version,p_request_id,'submit');
$$;
create function public.return_article(p_article_id uuid,p_expected_version integer,p_request_id uuid,p_note text)
returns jsonb language sql security definer set search_path = '' set timezone = 'UTC' as $$
  select private.transition_article(p_article_id,p_expected_version,p_request_id,'return',p_note);
$$;
revoke all on function public.submit_article(uuid,integer,uuid) from public,anon,authenticated;
revoke all on function public.return_article(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_article(uuid,integer,uuid) to authenticated;
grant execute on function public.return_article(uuid,integer,uuid,text) to authenticated;

-- Editors and administrators: drafts waiting for review, plus the editor's own publications.
create function public.list_review_articles()
returns table(article_id uuid, title text, status text, owner_name text, section_name text,
  submitted_at timestamptz, published_at timestamptz, edit_version integer)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_profile uuid;
begin
  select p.id into actor_profile from public.profiles p
    join public.memberships m on m.user_id=p.auth_user_id and m.active and m.role in ('editor','administrator')
    where p.auth_user_id=actor and p.active and private.has_eligible_identity();
  if actor_profile is null then
    raise exception 'Editor access required.' using errcode='42501'; end if;
  return query
    select a.id, a.title, a.status::text, o.display_name, s.name, a.review_requested_at,
      a.published_at, a.edit_version
    from public.articles a
    join public.profiles o on o.id=a.owner_profile_id
    join public.sections s on s.id=a.section_id
    where (a.status='draft' and a.review_requested_at is not null)
      or (a.status='published' and a.published_by_profile_id=actor_profile)
    order by (a.status='draft') desc, coalesce(a.review_requested_at,a.published_at), a.id
    limit 100;
end;
$$;
revoke all on function public.list_review_articles() from public,anon,authenticated;
grant execute on function public.list_review_articles() to authenticated;

-- Audit reader: new article actions.
CREATE OR REPLACE FUNCTION private.manage_membership(p_operation text, p_target_user_id uuid, p_expected_version integer, p_request_id uuid, p_role app_role, p_display_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid();
  fingerprint text; old_receipt private.membership_write_receipts%rowtype;
  target_auth record; target_member public.memberships%rowtype;
  target_profile record; member_exists boolean; profile_exists boolean;
  target_eligible_admin boolean; changed boolean := false;
  next_version integer; next_role public.app_role; next_active boolean;
  audit_action text; result jsonb; admin_count integer;
begin
  if p_operation not in ('approve','change_role','deactivate')
    or p_target_user_id is null or p_request_id is null
    or (p_operation = 'approve' and (
      p_role is null or p_display_name is null
      or p_display_name <> pg_catalog.btrim(p_display_name)
      or pg_catalog.char_length(p_display_name) not between 1 and 120
      or p_display_name ~ '[[:cntrl:]]'
      or (p_expected_version is not null and p_expected_version < 1)))
    or (p_operation = 'change_role' and (
      p_role is null or p_display_name is not null
      or p_expected_version is null or p_expected_version < 1))
    or (p_operation = 'deactivate' and (
      p_role is not null or p_display_name is not null
      or p_expected_version is null or p_expected_version < 1)) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;

  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation',p_operation,'target',p_target_user_id,'expectedVersion',p_expected_version,
    'role',p_role,'displayName',p_display_name));
  -- Serialize all membership writes before rechecking actor and last-admin state.
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  -- Auth provider changes do not take the editorial advisory lock. Hold every
  -- counted administrator's identity through commit, and recheck after waits.
  perform u.id from auth.users u
    where u.id in (actor,p_target_user_id) or exists (
      select 1 from public.memberships m
      where m.user_id=u.id and m.active and m.role='administrator')
    order by u.id for share;
  if not private.has_eligible_identity_for(actor) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into old_receipt from private.membership_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if old_receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb;
    end if;
    return pg_catalog.jsonb_set(old_receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=actor and active
  ) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;

  select u.id,u.email,u.email_confirmed_at,u.raw_app_meta_data
    into target_auth from auth.users u where u.id=p_target_user_id for share;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if p_operation='approve' or (p_operation='change_role' and p_role='administrator') then
    if not private.has_eligible_identity_for(p_target_user_id) then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
  end if;

  select * into target_member from public.memberships
    where user_id=p_target_user_id for update;
  member_exists := found;
  if p_operation='approve' then
    select id,active into target_profile from public.profiles
      where auth_user_id=p_target_user_id for update;
    profile_exists := found;
    if profile_exists and not target_profile.active then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    if member_exists then
      if p_expected_version is distinct from target_member.edit_version then
        return '{"ok":false,"code":"conflict"}'::jsonb;
      end if;
      if target_member.active then
        if target_member.role <> p_role then
          return '{"ok":false,"code":"conflict"}'::jsonb;
        end if;
        next_version := target_member.edit_version;
        next_role := target_member.role;
        next_active := true;
      else
        update public.memberships set active=true,role=p_role,approved_by=actor,
          approved_at=pg_catalog.now(),revoked_at=null,
          edit_version=edit_version+1 where user_id=p_target_user_id
          returning edit_version,role,active into next_version,next_role,next_active;
        changed := true;
      end if;
    else
      if p_expected_version is not null then
        return '{"ok":false,"code":"conflict"}'::jsonb;
      end if;
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values(p_target_user_id,p_role,true,actor,pg_catalog.now())
        returning edit_version,role,active into next_version,next_role,next_active;
      changed := true;
    end if;
    if not profile_exists then
      insert into public.profiles(auth_user_id,display_name,slug)
        values(p_target_user_id,p_display_name,private.allocate_profile_slug(p_display_name));
      changed := true;
    end if;
    audit_action := 'membership.approved';
  else
    if not member_exists or not target_member.active then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    if target_member.edit_version <> p_expected_version then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    if p_operation='change_role' and target_member.role=p_role then
      next_version := target_member.edit_version;
      next_role := target_member.role;
      next_active := true;
    else
      if target_member.role='administrator' and
        (p_operation='deactivate' or p_role<>'administrator') then
        select exists(select 1 from public.profiles p
          where p.auth_user_id=p_target_user_id and p.active)
          and private.has_eligible_identity_for(p_target_user_id)
          into target_eligible_admin;
        select pg_catalog.count(*) into admin_count
        from public.memberships m
        join public.profiles p on p.auth_user_id=m.user_id and p.active
        where m.active and m.role='administrator'
          and private.has_eligible_identity_for(m.user_id);
        if target_eligible_admin and admin_count <= 1 then
          return '{"ok":false,"code":"conflict"}'::jsonb;
        end if;
      end if;
      if p_operation='change_role' then
        update public.memberships set role=p_role,edit_version=edit_version+1
          where user_id=p_target_user_id
          returning edit_version,role,active into next_version,next_role,next_active;
      else
        update public.memberships set active=false,revoked_at=pg_catalog.now(),
          edit_version=edit_version+1 where user_id=p_target_user_id
          returning edit_version,role,active into next_version,next_role,next_active;
      end if;
      changed := true;
    end if;
    audit_action := case when p_operation='change_role' then
      'membership.role_changed' else 'membership.deactivated' end;
  end if;

  result := pg_catalog.jsonb_build_object('ok',true,'targetUserId',p_target_user_id,
    'role',next_role,'active',next_active,'version',next_version,
    'changed',changed,'replayed',false);
  if changed then
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,audit_action,'membership',p_target_user_id,p_request_id);
  end if;
  insert into private.membership_write_receipts(
    actor_user_id,request_id,operation,target_user_id,payload_hash,result)
    values(actor,p_request_id,p_operation,p_target_user_id,fingerprint,result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_staff(p_request_id uuid, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); entry jsonb; mail text; wanted_role public.app_role;
  wanted_name text; inv private.membership_invitations%rowtype;
  old_receipt private.membership_write_receipts%rowtype; fingerprint text;
  added integer := 0; updated integer := 0; skipped jsonb := '[]'::jsonb;
  seen text[] := '{}'; result jsonb; key text;
begin
  if p_request_id is null or p_entries is null
    or pg_catalog.jsonb_typeof(p_entries) <> 'array'
    or pg_catalog.jsonb_array_length(p_entries) not between 1 and 200 then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  for entry in select value from pg_catalog.jsonb_array_elements(p_entries) loop
    if pg_catalog.jsonb_typeof(entry) <> 'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(entry) k
        where k not in ('email','role','displayName'))
      or pg_catalog.jsonb_typeof(entry -> 'email') is distinct from 'string'
      or (entry ->> 'role') not in ('author','editor','administrator')
      or (entry ? 'displayName' and pg_catalog.jsonb_typeof(entry -> 'displayName')
        not in ('string','null')) then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
    mail := pg_catalog.lower(entry ->> 'email');
    wanted_name := entry ->> 'displayName';
    if mail !~ '^[^@[:space:]]+@bc[.]edu$' or pg_catalog.char_length(mail) > 255
      or mail = any(seen)
      or (wanted_name is not null and (
        wanted_name <> pg_catalog.btrim(wanted_name)
        or pg_catalog.char_length(wanted_name) not between 1 and 120
        or wanted_name ~ '[[:cntrl:]]')) then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
    seen := seen || mail;
  end loop;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','invite','entries',(
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'email',pg_catalog.lower(e ->> 'email'),'role',e ->> 'role',
        'displayName',e -> 'displayName') order by pg_catalog.lower(e ->> 'email'))
      from pg_catalog.jsonb_array_elements(p_entries) e)));
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform u.id from auth.users u where u.id = actor for share;
  if not private.has_eligible_identity_for(actor) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into old_receipt from private.membership_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if old_receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb;
    end if;
    return pg_catalog.jsonb_set(old_receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=actor and active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  for entry in select value from pg_catalog.jsonb_array_elements(p_entries) loop
    mail := pg_catalog.lower(entry ->> 'email');
    wanted_role := (entry ->> 'role')::public.app_role;
    wanted_name := entry ->> 'displayName';
    -- People who already hold a membership are managed from their own row.
    if exists (select 1 from auth.users u join public.memberships m on m.user_id=u.id
      where pg_catalog.lower(u.email)=mail) then
      skipped := skipped || pg_catalog.to_jsonb(mail);
      continue;
    end if;
    select * into inv from private.membership_invitations
      where email=mail and claimed_user_id is null and removed_at is null for update;
    if found then
      if inv.role <> wanted_role
        or (wanted_name is not null and wanted_name is distinct from inv.display_name) then
        update private.membership_invitations
          set role=wanted_role,display_name=coalesce(wanted_name,display_name),
            edit_version=edit_version+1 where id=inv.id;
        insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
          values(actor,'membership.invitation_changed','membership',inv.id,p_request_id);
        updated := updated + 1;
      end if;
    else
      insert into private.membership_invitations(email,role,display_name,invited_by)
        values(mail,wanted_role,wanted_name,actor) returning * into inv;
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
        values(actor,'membership.invited','membership',inv.id,p_request_id);
      added := added + 1;
    end if;
  end loop;
  result := pg_catalog.jsonb_build_object('ok',true,'added',added,'updated',updated,
    'skipped',skipped,'replayed',false);
  insert into private.membership_write_receipts(
    actor_user_id,request_id,operation,target_user_id,payload_hash,result)
    values(actor,p_request_id,'invite',null,fingerprint,result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_staff(p_limit integer DEFAULT 21, p_search text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_state text DEFAULT 'all'::text, p_after_email text DEFAULT NULL::text, p_after_key text DEFAULT NULL::text)
 RETURNS TABLE(key text, user_id uuid, invitation_id uuid, email text, display_name text, role app_role, state text, edit_version integer, eligible boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pattern text;
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or p_state is null or p_state not in ('all','active','inactive','invited')
    or (p_role is not null and p_role not in ('author','editor','administrator'))
    or (p_search is not null and pg_catalog.char_length(p_search) > 100)
    or ((p_after_email is null) <> (p_after_key is null))
    or (p_after_email is not null and (
      pg_catalog.char_length(p_after_email) > 255
      or p_after_email <> pg_catalog.lower(p_after_email)
      or pg_catalog.char_length(p_after_key) > 64)) then
    raise exception 'Invalid membership list request.' using errcode='22023';
  end if;
  pattern := case when pg_catalog.btrim(coalesce(p_search,'')) = '' then null
    else '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
      pg_catalog.btrim(p_search),'\','\\'),'%','\%'),'_','\_') || '%' end;
  return query
  with people as (
    select m.user_id::text as k,m.user_id as uid,null::uuid as iid,
      coalesce(pg_catalog.lower(u.email),'')::text as mail,
      p.display_name as dn,m.role as r,
      (case when m.active then 'active' else 'inactive' end)::text as st,
      m.edit_version as ev,private.has_eligible_identity_for(m.user_id) as ok
    from public.memberships m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.auth_user_id=m.user_id
    union all
    select i.id::text,null::uuid,i.id,i.email,i.display_name,i.role,'invited',
      i.edit_version,true
    from private.membership_invitations i
    where i.claimed_user_id is null and i.removed_at is null
  )
  select x.k,x.uid,x.iid,x.mail,x.dn,x.r,x.st,x.ev,x.ok from people x
  where (p_state='all' or x.st=p_state)
    and (p_role is null or x.r::text=p_role)
    and (pattern is null or x.mail ilike pattern escape '\'
      or coalesce(x.dn,'') ilike pattern escape '\')
    and (p_after_email is null or
      (x.mail collate "C",x.k collate "C") > (p_after_email collate "C",p_after_key collate "C"))
  order by x.mail collate "C",x.k collate "C"
  limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_article_audit_events(p_limit integer DEFAULT 20, p_action text DEFAULT NULL::text, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(event_id uuid, action text, resource_id uuid, created_at timestamp with time zone, actor_label text, article_exists boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pattern text;
begin
  if not private.is_active_administrator() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51
    or (p_action is not null and p_action not in (
      'article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored', 'article.deleted',
      'article.submitted', 'article.returned'
    ))
    or (p_search is not null and pg_catalog.char_length(p_search) > 80)
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid audit request.' using errcode = '22023';
  end if;
  pattern := case when pg_catalog.btrim(coalesce(p_search,'')) = '' then null
    else '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
      pg_catalog.btrim(p_search),'\','\\'),'%','\%'),'_','\_') || '%' end;

  return query
  select e.id, e.action, e.resource_id, e.created_at,
    coalesce(p.display_name, 'Former member')::text,
    exists(select 1 from public.articles a where a.id=e.resource_id)
  from public.audit_events e
  left join public.profiles p on p.auth_user_id = e.actor_user_id
  where e.resource_type = 'article'
    and e.action in ('article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored', 'article.deleted',
      'article.submitted', 'article.returned')
    and (p_action is null or e.action = p_action)
    and (pattern is null
      or p.display_name ilike pattern escape '\'
      or exists(select 1 from public.articles a
        where a.id = e.resource_id and a.title ilike pattern escape '\')
      or (pg_catalog.to_char(e.created_at at time zone 'America/New_York','YYYY-MM-DD')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMonth FMDD, YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMonth FMDD YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','Mon FMDD, YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','Mon FMDD YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMM/FMDD/YYYY'))
        ilike pattern escape '\')
    and (p_before_at is null or (e.created_at, e.id) < (p_before_at, p_before_id))
  order by e.created_at desc, e.id desc
  limit p_limit;
end;
$function$;

drop function public.staff_summary();
create function public.staff_summary()
returns table(administrators integer, editors integer, authors integer, invited integer, inactive integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  return query select
    (select pg_catalog.count(*) from public.memberships where active and role='administrator')::integer,
    (select pg_catalog.count(*) from public.memberships where active and role='editor')::integer,
    (select pg_catalog.count(*) from public.memberships where active and role='author')::integer,
    (select pg_catalog.count(*) from private.membership_invitations
      where claimed_user_id is null and removed_at is null)::integer,
    (select pg_catalog.count(*) from public.memberships where not active)::integer;
end;
$$;
revoke all on function public.staff_summary() from public,anon,authenticated;
grant execute on function public.staff_summary() to authenticated;
