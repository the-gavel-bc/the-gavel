-- Reserve 80 tickets for full search and 40 for typeahead per server minute.
-- Keep the existing full-search counter and carry any excess used tickets into
-- the new lane so deploying midway through a minute preserves the total bound.
create sequence private.public_search_suggestion_budget
  as bigint minvalue 0 start with 0 increment by 1 cache 1 no cycle;
revoke all on sequence private.public_search_suggestion_budget from public,anon,authenticated,service_role;

do $$
declare minute_base bigint; used bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(1617,1);
  minute_base := floor(extract(epoch from clock_timestamp())/60)::bigint * 128;
  select last_value into used from private.public_search_budget;
  perform pg_catalog.setval('private.public_search_suggestion_budget'::regclass,
    minute_base + greatest(0, least(40, used - minute_base - 80)), true);
end;
$$;

create function private.claim_public_search_lane(p_suggestion boolean) returns integer
language plpgsql volatile set search_path='' as $$
declare
  budget regclass := case when p_suggestion
    then 'private.public_search_suggestion_budget'::regclass
    else 'private.public_search_budget'::regclass end;
  per_minute integer := case when p_suggestion then 40 else 80 end;
  -- Lock key 2 is reserved for sitemap reads.
  lane integer := case when p_suggestion then 3 else 1 end;
  minute_base bigint;
  used bigint;
  now_at timestamptz;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(1617,lane) then return 1; end if;
  now_at := clock_timestamp();
  minute_base := floor(extract(epoch from now_at)/60)::bigint * 128;
  used := coalesce(pg_catalog.pg_sequence_last_value(budget), 0);
  if used < minute_base then
    perform pg_catalog.setval(budget,minute_base,true);
    used := minute_base;
  end if;
  if used >= minute_base + per_minute then
    return greatest(1,least(60,ceil(extract(epoch from
      (to_timestamp((used/128+1)*60)-now_at)))))::integer;
  end if;
  perform pg_catalog.nextval(budget);
  return 0;
end;
$$;
revoke all on function private.claim_public_search_lane(boolean) from public,anon,authenticated,service_role;

create or replace function private.claim_public_search_budget() returns integer
language sql volatile set search_path='' as $$
  select private.claim_public_search_lane(false);
$$;

create or replace function public.suggest_public_articles(p_query text)
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
  retry:=private.claim_public_search_lane(true);
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
