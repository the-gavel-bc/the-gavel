create function public.search_public_articles(p_query text,p_limit integer default 12,p_cursor jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' set statement_timeout='2s' as $$
declare q text; terms text[]; before_at timestamptz; before_id uuid; retry integer;
  cards jsonb; items jsonb; more boolean; last_at timestamptz; last_id uuid;
begin
  perform pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  -- Only direct POST RPC receives the function deadline hoisted by PostgREST.
  -- Do not allow nested GraphQL/other RPC entry points to skip that boundary.
  if current_setting('request.path',true) is distinct from '/rpc/search_public_articles'
    or current_setting('request.method',true) is distinct from 'POST'
    or current_setting('transaction_read_only')='on' then return jsonb_build_object('kind','invalid'); end if;
  q:=private.normalize_search_query(p_query);
  if q is null or p_limit is null or p_limit not between 1 and 24 then return jsonb_build_object('kind','invalid'); end if;
  terms:=private.search_lexemes(q);
  if cardinality(terms) not between 1 and 8 or exists(select 1 from unnest(terms) word where char_length(word)>120) then
    return jsonb_build_object('kind','invalid'); end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) is distinct from 'object' or octet_length(p_cursor::text)>2048 then return jsonb_build_object('kind','invalid'); end if;
    if (select count(*) from jsonb_object_keys(p_cursor))<>4
      or p_cursor->'version' is distinct from '1'::jsonb or p_cursor->'query' is distinct from to_jsonb(q)
      or jsonb_typeof(p_cursor->'publishedAt') is distinct from 'string'
      or (p_cursor->>'publishedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
      or jsonb_typeof(p_cursor->'id') is distinct from 'string'
      or (p_cursor->>'id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return jsonb_build_object('kind','invalid'); end if;
    begin
      before_at:=(p_cursor->>'publishedAt')::timestamptz; before_id:=(p_cursor->>'id')::uuid;
      if to_char(before_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')<>p_cursor->>'publishedAt' then return jsonb_build_object('kind','invalid'); end if;
    exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then return jsonb_build_object('kind','invalid'); end;
  end if;
  retry:=private.claim_public_search_budget();
  if retry>0 then return jsonb_build_object('kind','rate_limited','retryAfter',retry); end if;
  -- Candidate visibility, ordering and the existing allowlisted card projection
  -- share one statement snapshot. No body-derived snippet is returned.
  with candidates as materialized (
    select c.article_id id,a.published_at from private.search_article_candidates(terms,p_limit+1,before_at,before_id) c
      join public.articles a on a.id=c.article_id
  ), page as materialized (select * from candidates order by published_at desc,id desc limit p_limit),
  stats as (
    select coalesce(array_agg(p.id order by p.published_at desc,p.id desc),'{}'::uuid[]) ids,
      (select count(*) from candidates)>p_limit has_more,
      (select id from page order by published_at,id limit 1) final_id,
      (select published_at from page order by published_at,id limit 1) final_at from page p
  ), mapped as materialized (select stats.*,private.homepage_card_map(ids) card_map from stats)
  select m.card_map,
    coalesce((select jsonb_agg(m.card_map->u.id::text order by u.ordinality) from unnest(m.ids) with ordinality u(id,ordinality)),'[]'::jsonb),
    m.has_more,m.final_at,m.final_id into cards,items,more,last_at,last_id from mapped m;
  if cards is null then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','ok','query',q,'items',items,'nextCursor',case when more then
    jsonb_build_object('version',1,'query',q,'publishedAt',to_char(last_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',last_id) else null end);
exception when query_canceled then
  -- Abort the whole RPC transaction, including any bulk invocation. A soft
  -- return would let later calls continue after the outer deadline had fired.
  raise sqlstate 'PGRST' using message='{"code":"search_unavailable","message":"Search is temporarily unavailable.","details":null,"hint":null}',
    detail='{"status":503,"headers":{"Cache-Control":"no-store"}}';
when others then
  -- Source reads roll back, but the nontransactional admitted ticket does not.
  perform pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  return jsonb_build_object('kind','unavailable');
end;
$$;
revoke all on function public.search_public_articles(text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.search_public_articles(text,integer,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
