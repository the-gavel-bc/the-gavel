-- Apply the same control character rule to new draft text and review notes.
create function private.is_safe_editorial_text(p_value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_value !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F\061C\200E\200F\202A-\202E\2066-\2069]';
$$;
revoke all on function private.is_safe_editorial_text(text) from public, anon, authenticated, service_role;

create or replace function private.is_safe_draft_scalar(p_value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_value = pg_catalog.btrim(p_value,
    U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000')
    and private.is_safe_editorial_text(p_value);
$$;
revoke all on function private.is_safe_draft_scalar(text) from public, anon, authenticated, service_role;

-- The one-argument validator continues to validate stored documents.
create or replace function private.is_valid_draft_document_for_write(p_content jsonb)
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
            if not private.is_safe_editorial_text(node ->> 'text')
              or not private.draft_json_keys(mark, array['type','attrs'])
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
  if p_operation='return' and not private.is_safe_editorial_text(note) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
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
