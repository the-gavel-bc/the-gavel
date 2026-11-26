begin;
select no_plan();
create temp table suggestion_budget_before as
select last_value, is_called from private.public_search_suggestion_budget;
select setval('private.public_search_suggestion_budget',
  floor(extract(epoch from clock_timestamp())/60)::bigint * 128,true);
select has_function('public','suggest_public_articles',array['text'],'typeahead suggestions exist');
insert into public.sections(id,name,slug) values('2c000000-0000-0000-0000-000000000061','Suggestsection','suggest-section');
insert into public.profiles(id,display_name,slug) values('1c000000-0000-0000-0000-000000000061','Suggestowner','suggest-owner');
insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at,archived_at)
select ('5d000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '1c000000-0000-0000-0000-000000000061','2c000000-0000-0000-0000-000000000061',
 case when n=9 then 'Zqxsuggest 100% literal_case' else 'Zqxsuggestneedle story '||n end,'suggest-story-'||n,
 '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Body"}]}]}}',
 case when n=7 then 'draft'::public.article_status when n=8 then 'archived'::public.article_status else 'published'::public.article_status end,
 case when n!=7 then '2026-11-01T00:00:00Z'::timestamptz+(n||' minutes')::interval else null end,
 case when n=8 then now() else null end from generate_series(1,9) n;
create temp table suggestions(label text primary key,result jsonb);
grant select,insert on suggestions to anon,authenticated;
select set_config('request.path','/rpc/suggest_public_articles',true);
select set_config('request.method','POST',true);
set local role anon;
insert into suggestions values
 ('partial',public.suggest_public_articles('zqxSUGGESTnee')),
 ('short',public.suggest_public_articles('z')),
 ('percent',public.suggest_public_articles('100%')),
 ('wildcard',public.suggest_public_articles('zqxsuggest_needle')),
 ('blank',public.suggest_public_articles('   ')),
 ('two',public.suggest_public_articles('zq')),
 ('midword',public.suggest_public_articles('suggestneedle')),
 ('keywords',public.suggest_public_articles('zqxsugg STO')),
 ('missing',public.suggest_public_articles('zqxsuggest nope'));
reset role;
select is((select result->>'kind' from suggestions where label='partial'),'ok','anonymous word-prefix typing matches');
select is((select jsonb_array_length(result->'items') from suggestions where label='partial'),6,'suggestions are capped at six');
select is((select result#>>'{items,0,slug}' from suggestions where label='partial'),'suggest-story-6','newest published title first');
select ok((select not exists(select 1 from jsonb_array_elements(result->'items') i where i->>'slug' in ('suggest-story-7','suggest-story-8')) from suggestions where label='partial'),'drafts and archived stories are never suggested');
select ok((select bool_and(not exists(select 1 from jsonb_object_keys(card) k where k not in ('id','slug','title','excerpt','publishedAt','section','owner','writers','mainImage'))) from suggestions,jsonb_array_elements(result->'items') card where label='partial'),'cards expose only allowlisted fields');
select is((select result->>'kind' from suggestions where label='short'),'invalid','one character is too short');
select is((select result->>'kind' from suggestions where label='two'),'invalid','two characters are too short');
select is((select jsonb_array_length(result->'items') from suggestions where label='midword'),0,'text inside a word does not match');
select is((select jsonb_array_length(result->'items') from suggestions where label='keywords'),6,'each typed word matches the start of a title word');
select is((select jsonb_array_length(result->'items') from suggestions where label='missing'),0,'every typed word must match');
select is((select result->>'kind' from suggestions where label='blank'),'invalid','whitespace is invalid');
select is((select result#>>'{items,0,slug}' from suggestions where label='percent'),'suggest-story-9','typed percent is literal text');
select is((select jsonb_array_length(result->'items') from suggestions where label='percent'),1,'percent does not act as a wildcard');
select is((select jsonb_array_length(result->'items') from suggestions where label='wildcard'),0,'underscore does not act as a wildcard');
select set_config('request.path','/rpc/search_public_articles',true);
select is(public.suggest_public_articles('zqxsuggest')->>'kind','invalid','only the direct RPC path is accepted');
select ok(not has_function_privilege('service_role','public.suggest_public_articles(text)','execute'),'service role is not granted');
select setval('private.public_search_suggestion_budget',last_value,is_called)
from suggestion_budget_before;
select * from finish();
rollback;
