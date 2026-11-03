-- Keep the applied Phase 3 validator for exact replay of receipts written with
-- its older payload shape. New writes never accept a supplied slug.
alter function private.check_draft_input(jsonb) rename to check_draft_input_with_slug;
revoke all on function private.check_draft_input_with_slug(jsonb) from public,anon,authenticated;

create function private.check_draft_input(p_draft jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  invalid constant jsonb := '{"ok":false,"code":"invalid_input"}'::jsonb;
  field text; cap integer; value jsonb; item jsonb; ids text[]; seen text[] := '{}'::text[];
  canonical jsonb; normalized jsonb; credits jsonb := '[]'::jsonb; pair text;
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_draft is null or octet_length(p_draft::text) > 1100000
    or not private.draft_json_keys(p_draft, array['schemaVersion','title','sectionId','excerpt','content','seoKeyphrase','metaDescription','categoryIds','tagIds','contributors'])
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
  if jsonb_typeof(value) = 'object' and (value -> 'format' is distinct from '"gavel-draft"'::jsonb or value -> 'version' is distinct from '1'::jsonb) then
    return '{"ok":false,"code":"unsupported_content"}'::jsonb;
  end if;
  if value <> 'null'::jsonb and not private.is_valid_draft_document(value) then return invalid; end if;
  return jsonb_set('{"ok":true,"value":null}'::jsonb, '{value}', canonical);
end;
$$;
revoke all on function private.check_draft_input(jsonb) from public,anon,authenticated;

create extension if not exists unaccent with schema extensions;

create function private.article_slug_base(p_title text)
returns text language plpgsql stable set search_path = '' as $$
declare normalized text;
begin
  normalized := trim(both '-' from pg_catalog.regexp_replace(
    pg_catalog.lower(extensions.unaccent(p_title)) collate "C",
    '[^a-z0-9]+','-','g'));
  normalized := trim(trailing '-' from pg_catalog.left(normalized,180));
  return coalesce(nullif(normalized,''),'article');
end;
$$;
revoke all on function private.article_slug_base(text) from public,anon,authenticated;

create function private.allocate_article_slug(p_title text,p_article_id uuid default null)
returns text language plpgsql volatile set search_path = '' as $$
declare base text := private.article_slug_base(p_title); candidate text; suffix text; n integer; holder uuid;
begin
  -- One transaction lock covers collisions between bases such as "news" and
  -- "news-2" as well as concurrent writes of the same title.
  perform pg_catalog.pg_advisory_xact_lock(72300320261102::bigint);
  for n in 1..10000 loop
    suffix := case when n=1 then '' else '-' || n::text end;
    candidate := trim(trailing '-' from pg_catalog.left(base,180-pg_catalog.char_length(suffix))) || suffix;
    select id into holder from public.articles where slug=candidate;
    if holder is null or holder=p_article_id then return candidate; end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.allocate_article_slug(text,uuid) from public,anon,authenticated;
