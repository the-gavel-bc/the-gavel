-- Keep these explicit code points aligned with the shared TypeScript validator.
-- Allow interior tabs and line breaks in multiline fields.
create function private.is_safe_draft_scalar(p_value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_value = pg_catalog.btrim(p_value,
    U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000')
    and p_value !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F\061C\200E\200F\202A-\202E\2066-\2069]';
$$;
revoke all on function private.is_safe_draft_scalar(text) from public, anon, authenticated, service_role;

-- The one-argument validator continues to validate stored documents.
create function private.is_valid_draft_document_for_write(p_content jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  nodes jsonb[]; depths integer[]; kinds text[]; last_node integer := 1;
  node jsonb; child jsonb; mark jsonb; attrs jsonb; node_type text; kind text;
  depth integer; node_count integer := 0; inline_node boolean; seen text[]; seen_images text[] := array[]::text[];
begin
  if p_content is null then return true; end if;
  if octet_length(p_content::text) > 1048576
    or not private.draft_json_keys(p_content, array['format','version','document'])
    or (p_content -> 'format' = '"gavel-draft"'::jsonb and p_content -> 'version' in ('1'::jsonb,'2'::jsonb)) is not true then return false; end if;
  nodes := array[p_content -> 'document']; depths := array[1]; kinds := array['root'];
  while last_node > 0 loop
    node := nodes[last_node]; depth := depths[last_node]; kind := kinds[last_node];
    nodes[last_node] := null; last_node := last_node - 1; node_count := node_count + 1;
    if node_count > 5000 or depth > 16 or jsonb_typeof(node) is distinct from 'object' then return false; end if;
    node_type := node ->> 'type';
    if (case kind when 'root' then node_type = 'doc'
      when 'block' then (node_type in ('paragraph','heading','blockquote','bulletList','orderedList') or (node_type='image' and p_content->'version'='2'::jsonb))
      when 'item' then node_type = 'listItem' when 'inline' then node_type in ('text','hardBreak') else false end) is not true then return false; end if;
    if node_type = 'hardBreak' then
      if not private.draft_json_keys(node, array['type']) then return false; end if;
      continue;
    end if;
    if node_type = 'image' then
      attrs := node -> 'attrs';
      if not private.draft_json_keys(node,array['type','attrs']) then return false; end if;
      if not private.draft_json_keys(attrs,array['assetId','alt','caption']) then return false; end if;
      if jsonb_typeof(attrs->'assetId') is distinct from 'string' then return false; end if;
      if (attrs->>'assetId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
      if jsonb_typeof(attrs->'alt') is distinct from 'string' then return false; end if;
      if char_length(attrs->>'alt') not between 1 and 240 then return false; end if;
      if not private.is_safe_draft_scalar(attrs ->> 'alt') then return false; end if;
      if attrs->'caption'<>'null'::jsonb then
        if jsonb_typeof(attrs->'caption') is distinct from 'string' then return false; end if;
        if char_length(attrs->>'caption') not between 1 and 500 then return false; end if;
        if not private.is_safe_draft_scalar(attrs ->> 'caption') then return false; end if;
      end if;
      if lower(attrs->>'assetId')=any(seen_images) then return false; end if;
      seen_images := array_append(seen_images,lower(attrs->>'assetId'));
      continue;
    end if;
    if node_type = 'text' then
      if not private.draft_json_keys(node, array['type','text'], array['marks'])
        or jsonb_typeof(node -> 'text') is distinct from 'string' or char_length(node ->> 'text') < 1 then return false; end if;
      if node ? 'marks' then
        if jsonb_typeof(node -> 'marks') is distinct from 'array' then return false; end if;
        if jsonb_array_length(node -> 'marks') > 3 then return false; end if;
        seen := '{}';
        for mark in select value from jsonb_array_elements(node -> 'marks') loop
          if jsonb_typeof(mark) is distinct from 'object' or (mark ->> 'type' in ('bold','italic','link')) is not true
            or mark ->> 'type' = any(seen) then return false; end if;
          seen := array_append(seen, mark ->> 'type');
          if mark ->> 'type' = 'link' then
            if not private.draft_json_keys(mark, array['type','attrs'])
              or not private.draft_json_keys(mark -> 'attrs', array['href'])
              or jsonb_typeof(mark #> '{attrs,href}') is distinct from 'string'
              or not private.is_valid_draft_link(mark #>> '{attrs,href}') then return false; end if;
          elsif not private.draft_json_keys(mark, array['type']) then return false;
          end if;
        end loop;
      end if;
      continue;
    end if;
    inline_node := node_type in ('paragraph','heading');
    if inline_node then
      if not private.draft_json_keys(node, case when node_type = 'heading' then array['type','attrs'] else array['type'] end, array['content']) then return false; end if;
    elsif not private.draft_json_keys(node, case when node_type = 'orderedList' then array['type','attrs','content'] else array['type','content'] end) then return false;
    end if;
    attrs := node -> 'attrs';
    if node_type = 'heading' then
      if not private.draft_json_keys(attrs, array['level']) or (attrs -> 'level' in ('2'::jsonb,'3'::jsonb)) is not true then return false; end if;
    elsif node_type = 'orderedList' then
      if not private.draft_json_keys(attrs, array['start']) or jsonb_typeof(attrs -> 'start') is distinct from 'number' then return false; end if;
      if (attrs ->> 'start')::numeric not between 1 and 2147483647 or trunc((attrs ->> 'start')::numeric) <> (attrs ->> 'start')::numeric then return false; end if;
    end if;
    if not node ? 'content' then continue; end if;
    if jsonb_typeof(node -> 'content') is distinct from 'array' then return false; end if;
    if not inline_node and jsonb_array_length(node -> 'content') = 0 then return false; end if;
    if node_type = 'listItem' and (node #>> '{content,0,type}' = 'paragraph') is not true then return false; end if;
    if node_count + last_node + jsonb_array_length(node -> 'content') > 5000 then return false; end if;
    for child in select value from jsonb_array_elements(node -> 'content') loop
      last_node := last_node + 1; nodes[last_node] := child; depths[last_node] := depth + 1;
      kinds[last_node] := case when inline_node then 'inline' when node_type in ('bulletList','orderedList') then 'item' else 'block' end;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function private.is_valid_draft_document_for_write(jsonb) from public, anon, authenticated, service_role;

CREATE FUNCTION private.check_draft_input_for_write(p_draft jsonb)
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
    if char_length(p_draft ->> field) not between 1 and cap or not private.is_safe_draft_scalar(p_draft ->> field) then return invalid; end if;
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
  if value <> 'null'::jsonb and not private.is_valid_draft_document_for_write(value) then return invalid; end if;
  return jsonb_set('{"ok":true,"value":null}'::jsonb, '{value}', canonical);
end;
$function$;
revoke all on function private.check_draft_input_for_write(jsonb) from public, anon, authenticated, service_role;

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
