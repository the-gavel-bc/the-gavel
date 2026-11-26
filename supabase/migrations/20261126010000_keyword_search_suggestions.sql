-- Search suggestions match keywords, not arbitrary substrings: each typed
-- word must start a word of a published title, and at least 3 characters
-- are required. Ranking, budget, deadline and the card projection are
-- unchanged. A title scan stays at about 5 ms for 5,000 published articles;
-- see docs/superpowers/plans/2026-11-26-performance-batch.md (slice 2).
create or replace function public.suggest_public_articles(p_query text)
returns jsonb language plpgsql volatile security definer set search_path='' set statement_timeout='2s' as $$
declare q text; terms text[]; retry integer; ids uuid[]; cards jsonb;
begin
  perform pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  -- Same direct-POST guard as search_public_articles, so the deadline applies.
  if current_setting('request.path',true) is distinct from '/rpc/suggest_public_articles'
    or current_setting('request.method',true) is distinct from 'POST'
    or current_setting('transaction_read_only')='on' then return jsonb_build_object('kind','invalid'); end if;
  q:=private.normalize_search_query(p_query);
  if q is null or char_length(q)<3 then return jsonb_build_object('kind','invalid'); end if;
  retry:=private.claim_public_search_lane(true);
  if retry>0 then return jsonb_build_object('kind','rate_limited','retryAfter',retry); end if;
  -- Keyword matching: every typed word must start a word in the title, so
  -- "camp din" finds "Campus dining" but "mpus" finds nothing. Regex
  -- metacharacters in the input are escaped and match literally.
  select array_agg(regexp_replace(t,'([^[:alnum:]])','\\\1','g') order by o) into terms
  from unnest(string_to_array(lower(q),' ')) with ordinality u(t,o) where o<=8;
  select coalesce(array_agg(t.id order by t.published_at desc,t.id desc),'{}'::uuid[]) into ids from (
    select a.id,a.published_at from public.articles a
    where a.status='published'
      and not exists(select 1 from unnest(terms) w where lower(a.title) !~ ('\m'||w))
    order by a.published_at desc,a.id desc limit 6) t;
  cards:=private.homepage_card_map(ids);
  if cards is null then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','ok','items',coalesce((select jsonb_agg(cards->u.id::text order by u.ordinality)
    from unnest(ids) with ordinality u(id,ordinality)),'[]'::jsonb));
exception when query_canceled then
  raise sqlstate 'PGRST' using message='{"code":"search_unavailable","message":"Search is temporarily unavailable.","details":null,"hint":null}',
    detail='{"status":503,"headers":{"Cache-Control":"no-store"}}';
when others then
  perform pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  return jsonb_build_object('kind','unavailable');
end;
$$;
notify pgrst,'reload schema';
