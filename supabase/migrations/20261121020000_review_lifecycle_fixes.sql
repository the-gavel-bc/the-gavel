begin;

-- Preserve existing dates from the already-applied publication date migration.
-- Repair only stale review metadata without changing article versions or times.
-- Take the constraint lock before disabling the trigger, avoiding a lock upgrade.
set local lock_timeout = '5s';
lock table public.articles in access exclusive mode;

alter table public.articles disable trigger articles_set_updated_at;

update public.articles
set review_requested_at = null, review_note = null
where status <> 'draft' and (review_requested_at is not null or review_note is not null);

alter table public.articles enable trigger articles_set_updated_at;

alter table public.articles add constraint articles_review_metadata_only_on_drafts
  check (status = 'draft' or (review_requested_at is null and review_note is null)) not valid;

alter table public.articles validate constraint articles_review_metadata_only_on_drafts;

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
          and private.article_authority(id,auth.uid(),'replay') for update;
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
        and private.article_authority(id,auth.uid(),'replay') for update;
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
  if not private.check_draft_references(draft)
    or not private.publication_date_allowed((draft ->> 'publicationDate')::date) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
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
        meta_description=draft ->> 'metaDescription',publication_date=(draft ->> 'publicationDate')::date,
        edit_version=edit_version+1 where id=p_article_id
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
        and private.article_authority(id,auth.uid(),'replay') for update;
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
  -- Keep receipt hashes based on the submitted input. Only turn a clear
  -- into a date if the row had a date to clear.
  if not (draft ? 'publicationDate') and current_article.publication_date is not null then
    draft := draft || jsonb_build_object('publicationDate',
      to_char((current_article.published_at at time zone 'America/New_York')::date,'YYYY-MM-DD'));
  end if;
  changed := stored_input<>draft;
  if changed and current_article.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if changed and not private.publication_date_allowed((draft->>'publicationDate')::date) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
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
        meta_description=draft->>'metaDescription',publication_date=(draft->>'publicationDate')::date,
        published_at=private.published_at_for((draft->>'publicationDate')::date,published_at),
        edit_version=edit_version+1 where id=p_article_id
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

CREATE OR REPLACE FUNCTION private.transition_article(p_article_id uuid, p_expected_version integer, p_request_id uuid, p_operation text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
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
    or (p_operation='submit' and (article.status<>'draft' or article.review_requested_at is not null
      or exists (select 1 from public.media_assets u where u.article_id=p_article_id and u.status in ('pending','uploading'))))
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
    if not private.publication_date_allowed(article.publication_date) then
      return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
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
      update public.articles set status='published',published_at=private.published_at_for(publication_date,now()),
        review_requested_at=null,review_note=null,
        published_by_profile_id=actor_profile,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    elsif p_operation='archive' then
      update public.articles set status='archived',archived_at=now(),edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
    else
      update public.articles set status='published',archived_at=null,review_requested_at=null,review_note=null,edit_version=edit_version+1
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
$function$;

commit;
