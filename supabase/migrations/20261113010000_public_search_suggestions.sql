-- Typeahead for the reader navigation search: published titles containing the
-- typed text (so partial words match), newest first. Full-text search stays
-- whole-word; this shares its bounded budget so total load is unchanged.
-- ponytail: sequential scan over published titles; add a pg_trgm GIN index on
-- lower(title) if the catalog grows enough to approach the 2s deadline.
create function public.suggest_public_articles(p_query text)
returns jsonb language plpgsql volatile security definer set search_path='' set statement_timeout='2s' as $$
declare q text; pattern text; retry integer; ids uuid[]; cards jsonb;
begin
  perform pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  -- Same direct-POST guard as search_public_articles, so the deadline applies.
  if current_setting('request.path',true) is distinct from '/rpc/suggest_public_articles'
    or current_setting('request.method',true) is distinct from 'POST'
    or current_setting('transaction_read_only')='on' then return jsonb_build_object('kind','invalid'); end if;
  q:=private.normalize_search_query(p_query);
  if q is null or char_length(q)<2 then return jsonb_build_object('kind','invalid'); end if;
  retry:=private.claim_public_search_budget();
  if retry>0 then return jsonb_build_object('kind','rate_limited','retryAfter',retry); end if;
  -- Typed % and _ are literal text, not wildcards.
  pattern:='%'||replace(replace(replace(lower(q),'\','\\'),'%','\%'),'_','\_')||'%';
  select coalesce(array_agg(t.id order by t.published_at desc,t.id desc),'{}'::uuid[]) into ids from (
    select a.id,a.published_at from public.articles a
    where a.status='published' and lower(a.title) like pattern escape '\'
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
revoke all on function public.suggest_public_articles(text) from public,anon,authenticated,service_role;
grant execute on function public.suggest_public_articles(text) to anon,authenticated;
notify pgrst,'reload schema';
