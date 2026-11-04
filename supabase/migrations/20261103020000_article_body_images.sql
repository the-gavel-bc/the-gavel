-- Version 2 body images remain private relational references; old documents are unchanged.
create table public.article_body_images (
  article_id uuid not null references public.articles(id) on update restrict on delete cascade,
  asset_id uuid not null,
  primary key (article_id,asset_id),
  foreign key (asset_id,article_id) references public.media_assets(id,article_id)
    on update restrict on delete restrict
);
create index article_body_images_asset_id_idx on public.article_body_images(asset_id);
alter table public.article_body_images enable row level security;
revoke all on public.article_body_images from public,anon,authenticated;
grant select on public.article_body_images to authenticated;
create policy article_body_images_read on public.article_body_images for select to authenticated
using (private.can_read_article(article_id));

alter table private.article_revision_media_refs drop constraint article_revision_media_refs_pkey;
alter table private.article_revision_media_refs add primary key (revision_id,asset_id);

create function private.body_image_ids(p_content jsonb) returns table(asset_id uuid)
language sql immutable set search_path = '' as $$
  select distinct (node #>> '{attrs,assetId}')::uuid
  from jsonb_path_query(coalesce(p_content,'null'::jsonb), '$.document.** ? (@.type == "image")') node;
$$;
revoke all on function private.body_image_ids(jsonb) from public,anon,authenticated;

create function private.check_body_image_assets(p_article_id uuid,p_content jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare image_id uuid; asset public.media_assets%rowtype;
begin
  if p_content is null then return true; end if;
  for image_id in select b.asset_id from private.body_image_ids(p_content) b order by b.asset_id loop
    select * into asset from public.media_assets where id=image_id for share;
    if not found or asset.article_id<>p_article_id or asset.status<>'finalized' then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.check_body_image_assets(uuid,jsonb) from public,anon,authenticated;

create function private.replace_body_image_refs(p_article_id uuid,p_content jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.article_body_images where article_id=p_article_id;
  insert into public.article_body_images(article_id,asset_id)
    select p_article_id,b.asset_id from private.body_image_ids(p_content) b;
end;
$$;
revoke all on function private.replace_body_image_refs(uuid,jsonb) from public,anon,authenticated;

create or replace function private.capture_revision_main_image_ref() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.snapshot->'mainImage'->>'assetId' is not null then
    insert into private.article_revision_media_refs(revision_id,article_id,asset_id)
      values(new.id,new.article_id,(new.snapshot->'mainImage'->>'assetId')::uuid)
      on conflict do nothing;
  end if;
  insert into private.article_revision_media_refs(revision_id,article_id,asset_id)
    select new.id,new.article_id,b.asset_id
    from private.body_image_ids(new.snapshot #> '{article,content}') b
    on conflict do nothing;
  return new;
end;
$$;

-- Preserve existing revision refs and add any version 2 body image refs already present.
insert into private.article_revision_media_refs(revision_id,article_id,asset_id)
select r.id,r.article_id,b.asset_id from public.article_revisions r
cross join lateral private.body_image_ids(r.snapshot #> '{article,content}') b
on conflict do nothing;


create or replace function private.is_valid_draft_document(p_content jsonb)
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
      if not private.draft_json_keys(node,array['type','attrs'])
        or not private.draft_json_keys(attrs,array['assetId','alt','caption'])
        or jsonb_typeof(attrs->'assetId') is distinct from 'string'
        or attrs->>'assetId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(attrs->'alt') is distinct from 'string'
        or char_length(attrs->>'alt') not between 1 and 240
        or attrs->>'alt' ~ '(^[[:space:]]|[[:space:]]$)'
        or (attrs->'caption'<>'null'::jsonb and
          (jsonb_typeof(attrs->'caption') is distinct from 'string'
            or char_length(attrs->>'caption') not between 1 and 500
            or attrs->>'caption' ~ '(^[[:space:]]|[[:space:]]$)'))
        or lower(attrs->>'assetId')=any(seen_images) then return false; end if;
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

create or replace function private.check_draft_input(p_draft jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
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
  if not private.draft_json_keys(p_draft, array['schemaVersion','title','sectionId','excerpt','content','seoKeyphrase','metaDescription','categoryIds','tagIds','contributors'])
    or (p_draft -> 'schemaVersion' = '1'::jsonb) is not true then return invalid; end if;
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
$$;
