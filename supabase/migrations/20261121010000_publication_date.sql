-- Publication date: an optional date (Eastern) readers see as the publication
-- date. Blank means the day it is published. published_at stays the one value
-- public queries order by. Plan: docs/superpowers/plans/2026-11-19-publication-date-field.md

alter table public.articles add column publication_date date;
grant select (publication_date) on public.articles to authenticated;
update public.articles set publication_date = (published_at at time zone 'America/New_York')::date
  where published_at is not null;

-- Not-in-the-future is time dependent, so it is a stable function, not a constraint
-- and not part of the immutable input check.
create function private.publication_date_allowed(p_date date)
returns boolean language sql stable set search_path = '' as $$
  select p_date is null or p_date <= (pg_catalog.now() at time zone 'America/New_York')::date;
$$;

-- The published time for a chosen date: unchanged when the day matches the
-- fallback's Eastern day, now() for today, otherwise noon Eastern of that day.
create function private.published_at_for(p_date date, p_fallback timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select case
    when p_date is null then p_fallback
    when (p_fallback at time zone 'America/New_York')::date = p_date then p_fallback
    when p_date = (pg_catalog.now() at time zone 'America/New_York')::date then pg_catalog.now()
    else ((p_date::timestamp + interval '12 hours') at time zone 'America/New_York')
  end;
$$;
revoke all on function private.publication_date_allowed(date), private.published_at_for(date, timestamptz)
  from public, anon, authenticated;


CREATE OR REPLACE FUNCTION private.check_draft_input(p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  invalid constant jsonb := '{"ok":false,"code":"invalid_input"}'::jsonb;
  field text; cap integer; value jsonb; item jsonb; ids text[]; seen text[] := '{}'::text[];
  canonical jsonb; normalized jsonb; credits jsonb := '[]'::jsonb; pair text;
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_draft is null or octet_length(p_draft::text) > 1100000 then return invalid; end if;
  -- During the mixed-version rollout, old clients may still send their slug.
  -- Validate its old shape, then discard it before hashing or writing content.
  if jsonb_typeof(p_draft) = 'object' and p_draft ? 'slug' then
    if jsonb_typeof(p_draft -> 'slug') is distinct from 'string'
      or char_length(p_draft ->> 'slug') not between 1 and 180
      or p_draft ->> 'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return invalid; end if;
    p_draft := p_draft - 'slug';
  end if;
  if not private.draft_json_keys(p_draft, array['schemaVersion','title','sectionId','excerpt','content','seoKeyphrase','metaDescription','categoryIds','tagIds','contributors'],array['publicationDate'])
    or (p_draft -> 'schemaVersion' = '1'::jsonb) is not true then return invalid; end if;
  -- Optional publication date: absent or null means none (stripped, so older
  -- clients' fingerprints still match); otherwise a real YYYY-MM-DD calendar date.
  if p_draft ? 'publicationDate' then
    if p_draft -> 'publicationDate' = 'null'::jsonb then
      p_draft := p_draft - 'publicationDate';
    elsif jsonb_typeof(p_draft -> 'publicationDate') is distinct from 'string'
      or p_draft ->> 'publicationDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return invalid;
    else
      begin
        if to_char((p_draft ->> 'publicationDate')::date,'YYYY-MM-DD') <> p_draft ->> 'publicationDate' then return invalid; end if;
      exception when others then return invalid;
      end;
    end if;
  end if;
  foreach field in array array['title','excerpt','seoKeyphrase','metaDescription'] loop
    value := p_draft -> field;
    cap := case field when 'title' then 240 when 'excerpt' then 600 when 'seoKeyphrase' then 160 else 320 end;
    if field <> 'title' and value = 'null'::jsonb then continue; end if;
    if jsonb_typeof(value) is distinct from 'string' then return invalid; end if;
    if char_length(p_draft ->> field) not between 1 and cap or p_draft ->> field ~ '(^[[:space:]]|[[:space:]]$)' then return invalid; end if;
  end loop;
  if jsonb_typeof(p_draft -> 'sectionId') is distinct from 'string' or p_draft ->> 'sectionId' !~ uuid_pattern then return invalid; end if;
  canonical := jsonb_set(p_draft, '{sectionId}', ('"' || lower(p_draft ->> 'sectionId') || '"')::jsonb);
  foreach field in array array['categoryIds','tagIds'] loop
    value := p_draft -> field; cap := case field when 'categoryIds' then 32 else 64 end;
    if jsonb_typeof(value) is distinct from 'array' then return invalid; end if;
    if jsonb_array_length(value) > cap then return invalid; end if;
    ids := '{}';
    for item in select v from jsonb_array_elements(value) v loop
      if jsonb_typeof(item) is distinct from 'string' or item #>> '{}' !~ uuid_pattern then return invalid; end if;
      if lower(item #>> '{}') = any(ids) then return invalid; end if;
      ids := array_append(ids, lower(item #>> '{}'));
    end loop;
    normalized := '[]'::jsonb;
    for pair in select id from unnest(ids) id order by id collate "C" loop
      normalized := normalized || ('["' || pair || '"]')::jsonb;
    end loop;
    canonical := jsonb_set(canonical, array[field], normalized);
  end loop;
  value := p_draft -> 'contributors';
  if jsonb_typeof(value) is distinct from 'array' then return invalid; end if;
  if jsonb_array_length(value) > 32 then return invalid; end if;
  for item in select v from jsonb_array_elements(value) v loop
    if not private.draft_json_keys(item, array['profileId','role','displayOrder'])
      or jsonb_typeof(item -> 'profileId') is distinct from 'string' or item ->> 'profileId' !~ uuid_pattern
      or (item -> 'role' in ('"writer"'::jsonb,'"editor"'::jsonb,'"creative"'::jsonb)) is not true
      or jsonb_typeof(item -> 'displayOrder') is distinct from 'number' then return invalid; end if;
    if (item ->> 'displayOrder')::numeric not between 0 and 2147483647 or trunc((item ->> 'displayOrder')::numeric) <> (item ->> 'displayOrder')::numeric then return invalid; end if;
    pair := lower(item ->> 'profileId') || ':' || (item ->> 'role');
    if pair = any(seen) then return invalid; end if;
    seen := array_append(seen, pair);
    item := jsonb_set(item, '{profileId}', ('"' || lower(item ->> 'profileId') || '"')::jsonb);
    item := jsonb_set(item, '{displayOrder}', ((item ->> 'displayOrder')::numeric::integer)::text::jsonb);
    credits := credits || jsonb_set('[null]'::jsonb, '{0}', item);
  end loop;
  normalized := '[]'::jsonb;
  for item in select v from jsonb_array_elements(credits) v order by (v ->> 'profileId') collate "C", (v ->> 'role') collate "C" loop
    normalized := normalized || jsonb_set('[null]'::jsonb, '{0}', item);
  end loop;
  credits := normalized;
  canonical := jsonb_set(canonical, '{contributors}', credits);
  value := p_draft -> 'content';
  if jsonb_typeof(value) = 'object' and (value -> 'format' is distinct from '"gavel-draft"'::jsonb or value -> 'version' not in ('1'::jsonb,'2'::jsonb)) then
    return '{"ok":false,"code":"unsupported_content"}'::jsonb;
  end if;
  if value <> 'null'::jsonb and not private.is_valid_draft_document(value) then return invalid; end if;
  return jsonb_set('{"ok":true,"value":null}'::jsonb, '{value}', canonical);
end;
$function$;

CREATE OR REPLACE FUNCTION private.capture_draft_snapshot(p_article_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare snapshot jsonb; article_fields jsonb; categories jsonb; tags jsonb; credits jsonb; main_image jsonb;
begin
  select jsonb_build_object(
    'id',a.id,'ownerProfileId',a.owner_profile_id,'sectionId',a.section_id,'title',a.title,'slug',a.slug,
    'excerpt',a.excerpt,'content',a.content,'seoKeyphrase',a.seo_keyphrase,'metaDescription',a.meta_description,
    'status',a.status,'publishedAt',a.published_at,'archivedAt',a.archived_at,
    'createdAt',a.created_at,'updatedAt',a.updated_at,'editVersion',a.edit_version
  ) || case when a.publication_date is null then '{}'::jsonb
    else jsonb_build_object('publicationDate',to_char(a.publication_date,'YYYY-MM-DD')) end
    into article_fields from public.articles a where a.id=p_article_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(category_id order by category_id),'[]'::jsonb) into categories
    from public.article_categories where article_id=p_article_id;
  select coalesce(jsonb_agg(tag_id order by tag_id),'[]'::jsonb) into tags
    from public.article_tags where article_id=p_article_id;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',profile_id,'role',contribution_role,'displayOrder',display_order)
    order by profile_id,contribution_role::text collate "C"),'[]'::jsonb) into credits
    from public.article_contributors where article_id=p_article_id;
  select jsonb_build_object('assetId',asset_id,'altText',alt_text,'credit',credit,'caption',caption)
    into main_image from public.article_main_images where article_id=p_article_id;
  snapshot := jsonb_build_object('format','gavel-article-snapshot','version',1,'article',article_fields,
    'categoryIds',categories,'tagIds',tags,'contributors',credits,'mainImage',main_image);
  if octet_length(snapshot::text) > 2097152 then
    raise exception using errcode='22023',message='Draft snapshot exceeds storage bound';
  end if;
  return snapshot;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_article_draft(p_request_id uuid, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  actor uuid := auth.uid(); owner_id uuid; checked jsonb; draft jsonb; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; article_id uuid; committed_at timestamptz; failed_constraint text;
  legacy_checked jsonb; candidate_slug text;
begin
  owner_id := private.lock_draft_actor();
  if owner_id is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  checked := private.check_draft_input(p_draft);
  select * into receipt from private.draft_write_receipts where actor_user_id=actor and request_id=p_request_id;
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
    if p_operation in ('submit','publish') and not private.publication_date_allowed(article.publication_date) then
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
      update public.articles set status='published',published_at=private.published_at_for(publication_date,now()),review_note=null,
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
$function$;
