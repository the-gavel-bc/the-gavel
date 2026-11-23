-- Match MAX_CONTRIBUTORS in the shared draft contract.
create function private.article_contributor_count_error(p_next integer,p_previous bigint)
returns jsonb language sql immutable strict set search_path = '' as $$
  select case when p_next > greatest(5, p_previous) then
    jsonb_build_object('ok',false,'code','invalid_input','fieldErrors',
      jsonb_build_object('contributors',format('Choose up to %s contributors.',greatest(5,p_previous))))
  end;
$$;
revoke all on function private.article_contributor_count_error(integer,bigint)
  from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_article_draft(p_request_id uuid, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  actor uuid := auth.uid(); contributor_error jsonb; owner_id uuid; checked jsonb; draft jsonb; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; article_id uuid; committed_at timestamptz; failed_constraint text;
  legacy_checked jsonb; candidate_slug text;
begin
  owner_id := private.lock_draft_actor();
  if owner_id is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  select * into receipt from private.draft_write_receipts where actor_user_id=actor and request_id=p_request_id;
  -- Only a matching committed receipt may replay with the previous rules.
  if receipt.request_id is null then
    checked := private.check_draft_input_for_write(p_draft);
  else
    checked := private.check_draft_input(p_draft);
  end if;
  -- Old in-flight commands may replay only their own already-committed receipt.
  if receipt.request_id is not null and p_draft ? 'slug' then
    legacy_checked := private.check_draft_input_with_slug(p_draft);
    if legacy_checked ->> 'ok' = 'true' then
      fingerprint := private.draft_request_hash('create',null,null,legacy_checked -> 'value');
      if receipt.operation='create' and receipt.payload_hash=fingerprint then
        if not private.can_read_article(receipt.article_id) then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
        return jsonb_build_object('ok',true,'articleId',receipt.article_id,'version',receipt.result_version,
          'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
      end if;
    end if;
  end if;
  if checked ->> 'ok' = 'true' then
    draft := checked -> 'value';
    fingerprint := private.draft_request_hash('create',null,null,draft);
    if receipt.request_id is not null and receipt.operation='create' and receipt.payload_hash=fingerprint then
      if not private.can_read_article(receipt.article_id) then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
      return jsonb_build_object('ok',true,'articleId',receipt.article_id,'version',receipt.result_version,
        'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
    end if;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if p_request_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if receipt.request_id is not null then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
  if checked ->> 'ok' <> 'true' then return checked; end if;
  contributor_error := private.article_contributor_count_error(
    jsonb_array_length(draft->'contributors'),0);
  if contributor_error is not null then return contributor_error; end if;
  if not private.check_draft_references(draft)
    or not private.publication_date_allowed((draft ->> 'publicationDate')::date) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if draft->'content'->>'version'='2' then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  candidate_slug := private.allocate_article_slug(draft ->> 'title');
  if candidate_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  -- Keep quota outside this guarded business subtransaction. Every content/history/
  -- receipt write rolls back together if any stage fails, including receipt insertion.
  begin
    insert into public.articles(owner_profile_id,section_id,title,slug,excerpt,content,seo_keyphrase,meta_description,publication_date)
    values(owner_id,(draft ->> 'sectionId')::uuid,draft ->> 'title',candidate_slug,draft ->> 'excerpt',
      nullif(draft -> 'content','null'::jsonb),draft ->> 'seoKeyphrase',draft ->> 'metaDescription',(draft ->> 'publicationDate')::date)
    returning id,updated_at into article_id,committed_at;
    insert into public.article_categories(article_id,category_id,section_id)
      select article_id,value::uuid,(draft ->> 'sectionId')::uuid from jsonb_array_elements_text(draft -> 'categoryIds');
    insert into public.article_tags(article_id,tag_id)
      select article_id,value::uuid from jsonb_array_elements_text(draft -> 'tagIds');
    insert into public.article_contributors(article_id,profile_id,contribution_role,display_order)
      select article_id,(value ->> 'profileId')::uuid,(value ->> 'role')::public.contribution_role,
        (value ->> 'displayOrder')::integer from jsonb_array_elements(draft -> 'contributors');
    insert into public.article_revisions(article_id,actor_user_id,snapshot)
      values(article_id,actor,private.capture_draft_snapshot(article_id));
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'article.created','article',article_id,p_request_id);
    insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,'create',article_id,fingerprint,1,committed_at,true);
  exception when unique_violation then
    get stacked diagnostics failed_constraint=constraint_name;
    if failed_constraint='articles_slug_key' then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
    raise log 'draft create failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  when others then
    raise log 'draft create failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',article_id,'version',1,'updatedAt',committed_at,'replayed',false,'changed',true);
exception when others then
  raise log 'draft create failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_article_draft(p_article_id uuid, p_expected_version integer, p_request_id uuid, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  actor uuid := auth.uid(); contributor_error jsonb; actor_profile uuid; checked jsonb; draft jsonb; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; current_article public.articles%rowtype;
  snapshot jsonb; stored_input jsonb; changed boolean; committed_version integer;
  committed_at timestamptz; failed_constraint text; legacy_checked jsonb; candidate_slug text;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  select * into receipt from private.draft_write_receipts where actor_user_id=actor and request_id=p_request_id;
  -- Only a matching committed receipt may replay with the previous rules.
  if receipt.request_id is null then
    checked := private.check_draft_input_for_write(p_draft);
  else
    checked := private.check_draft_input(p_draft);
  end if;
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
  contributor_error := private.article_contributor_count_error(
    jsonb_array_length(draft->'contributors'),(select count(*) from public.article_contributors where article_id=p_article_id));
  if contributor_error is not null then return contributor_error; end if;
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
  actor uuid := auth.uid(); contributor_error jsonb; actor_profile uuid; checked jsonb; draft jsonb; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; current_article public.articles%rowtype;
  snapshot jsonb; stored_input jsonb; changed boolean; committed_version integer;
  committed_at timestamptz;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  select * into receipt from private.draft_write_receipts
    where actor_user_id=actor and request_id=p_request_id;
  -- Only a matching committed receipt may replay with the previous rules.
  if receipt.request_id is null then
    checked := private.check_draft_input_for_write(p_draft);
  else
    checked := private.check_draft_input(p_draft);
  end if;
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
  contributor_error := private.article_contributor_count_error(
    jsonb_array_length(draft->'contributors'),jsonb_array_length(snapshot->'contributors'));
  if contributor_error is not null then return contributor_error; end if;
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
