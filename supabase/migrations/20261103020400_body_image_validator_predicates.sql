-- Validate each image field independently.
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
      if not private.draft_json_keys(node,array['type','attrs']) then return false; end if;
      if not private.draft_json_keys(attrs,array['assetId','alt','caption']) then return false; end if;
      if jsonb_typeof(attrs->'assetId') is distinct from 'string' then return false; end if;
      if (attrs->>'assetId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
      if jsonb_typeof(attrs->'alt') is distinct from 'string' then return false; end if;
      if char_length(attrs->>'alt') not between 1 and 240 then return false; end if;
      if (attrs->>'alt') ~ '(^[[:space:]]|[[:space:]]$)' then return false; end if;
      if attrs->'caption'<>'null'::jsonb then
        if jsonb_typeof(attrs->'caption') is distinct from 'string' then return false; end if;
        if char_length(attrs->>'caption') not between 1 and 500 then return false; end if;
        if (attrs->>'caption') ~ '(^[[:space:]]|[[:space:]]$)' then return false; end if;
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
