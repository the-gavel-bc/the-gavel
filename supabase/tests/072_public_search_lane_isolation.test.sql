begin;
select no_plan();

create temp table search_budget_before as
select last_value, is_called from private.public_search_budget;
create temp table suggestion_budget_before as
select last_value, is_called from private.public_search_suggestion_budget;
select setval('private.public_search_suggestion_budget',
  floor(extract(epoch from clock_timestamp())/60)::bigint * 128,true);
-- A future bucket fails closed independently of current server minute.
select setval('private.public_search_budget',
  (floor(extract(epoch from clock_timestamp())/60)::bigint+1)*128,true);
select set_config('request.path','/rpc/suggest_public_articles',true);
select set_config('request.method','POST',true);
select is(public.suggest_public_articles('campus')->>'kind','ok',
  'a full search budget does not block typeahead');
select setval('private.public_search_budget',last_value,is_called)
from search_budget_before;

-- Start one ticket below the typeahead ceiling without executing 39 queries.
select pg_sleep(case when extract(second from clock_timestamp())>55
  then 61-extract(second from clock_timestamp()) else 0 end);
select setval('private.public_search_suggestion_budget',
  floor(extract(epoch from clock_timestamp())/60)::bigint*128 + 39,true);
select is(public.suggest_public_articles('campus')->>'kind','ok',
  'typeahead admits ticket 40');
select is(public.suggest_public_articles('campus')->>'kind','rate_limited',
  'typeahead denies ticket 41');
select setval('private.public_search_suggestion_budget',
  (floor(extract(epoch from clock_timestamp())/60)::bigint+1)*128,true);
select setval('private.public_search_budget',
  floor(extract(epoch from clock_timestamp())/60)::bigint*128,true);
select is(public.suggest_public_articles('campus')->>'kind','rate_limited',
  'a full typeahead budget still returns a bounded rate limit');
select set_config('request.path','/rpc/search_public_articles',true);
select is(public.search_public_articles('campus')->>'kind','ok',
  'a full typeahead budget does not block full search');
select setval('private.public_search_budget',last_value,is_called)
from search_budget_before;
select setval('private.public_search_suggestion_budget',last_value,is_called)
from suggestion_budget_before;

select * from finish();
rollback;
