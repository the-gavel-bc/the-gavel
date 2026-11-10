-- Validate the entire bounded canonical document before reading allowlisted text.
create function private.canonical_search_text(p_content jsonb)
returns text language plpgsql immutable set search_path='' as $$
begin
  if p_content is null or not private.is_valid_draft_document(p_content) then return ''; end if;
  return (
    with recursive nodes(node,path) as (
      select p_content->'document',array[]::bigint[]
      union all
      select child.value,n.path||child.ordinality
      from nodes n cross join lateral jsonb_array_elements(
        coalesce(n.node->'content','[]'::jsonb)) with ordinality child(value,ordinality)
    )
    select coalesce(string_agg(case node->>'type'
      when 'text' then node->>'text'
      when 'hardBreak' then E'\n'
      when 'image' then E'\n'||coalesce(node#>>'{attrs,caption}','')||E'\n'
      when 'doc' then ''
      else E'\n' end,'' order by path),'') from nodes
  );
end;
$$;

-- Capture fixed built-in parser/token metadata at installation. Runtime index
-- expressions must use immutable primitives, not STABLE ts_debug catalog reads.
do $install$
declare parser_id oid; token_types integer[];
begin
  select cfgparser into parser_id from pg_catalog.pg_ts_config where oid='pg_catalog.simple'::regconfig;
  if exists(select 1 from pg_catalog.pg_ts_config_map where mapcfg='pg_catalog.simple'::regconfig
    and (mapdict<>'pg_catalog.simple'::regdictionary or mapseqno<>1)) then
    raise exception 'Unexpected simple search configuration.';
  end if;
  select array_agg(maptokentype::integer order by maptokentype) into token_types
    from pg_catalog.pg_ts_config_map where mapcfg='pg_catalog.simple'::regconfig;
  if parser_id is null or cardinality(token_types) is null then raise exception 'Missing simple search configuration.'; end if;
  execute format($definition$
    create function private.search_lexemes(p_text text)
    returns text[] language plpgsql immutable set search_path='' as $body$
    begin
      -- Dictionary/parser changes require rebuilding these expression indexes.
      return pg_catalog.tsvector_to_array(pg_catalog.to_tsvector('pg_catalog.simple'::regconfig,coalesce(p_text,'')));
    exception when program_limit_exceeded then
      -- Preserve the same configured tokens without the single-vector size cap.
      return (select coalesce(array_agg(distinct word collate "C" order by word collate "C"),array[]::text[])
        from pg_catalog.ts_parse(%s::oid,coalesce(p_text,'')) token
        cross join lateral unnest(pg_catalog.ts_lexize('pg_catalog.simple'::regdictionary,token.token)) word
        where token.tokid=any(%L::integer[]) and octet_length(token.token)<2048 and octet_length(word)<2048);
    end;
    $body$;
  $definition$,parser_id,token_types);
end;
$install$;

create function private.article_search_lexemes(p_title text,p_excerpt text,p_description text,p_content jsonb)
returns text[] language sql immutable set search_path='' as $$
  select private.search_lexemes(coalesce(p_title,'')||E'\n'||coalesce(p_excerpt,'')||E'\n'||
    coalesce(p_description,'')||E'\n'||private.canonical_search_text(p_content));
$$;

revoke all on function private.canonical_search_text(jsonb),private.search_lexemes(text),
  private.article_search_lexemes(text,text,text,jsonb) from public,anon,authenticated;
