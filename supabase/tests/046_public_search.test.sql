begin;
select no_plan();
select has_function('public','search_public_articles',array['text','integer','jsonb'],'bounded public search exists');
select is(private.normalize_search_query(E' \tBoston'||U&'\00a0\2003'||E'College\n'),'Boston College','canonical whitespace retains case');
select is(private.normalize_search_query(U&'\0085\feff'||'The Gavel'||U&'\3000'),'The Gavel','explicit Unicode whitespace parity');
select is(private.normalize_search_query(repeat('a',161)),null::text,'normalized length bounded');
select is(private.normalize_search_query('foo'||chr(1)),null::text,'residual controls rejected');
create temp table budget_before as select last_value,is_called from private.public_search_budget;
select set_config('request.path','/rpc/search_public_articles',true);
select set_config('request.method','POST',true);
select is(public.search_public_articles('!!!')->>'kind','invalid','punctuation-only query rejected');
select is(public.search_public_articles(repeat('word ',9))->>'kind','ok','duplicate normalized terms count once');
select is(public.search_public_articles('one two three four five six seven eight nine')->>'kind','invalid','distinct native words bounded');
select ok(not has_sequence_privilege('anon','private.public_search_budget','usage'),'anonymous cannot obtain quota tickets');
select ok(not has_sequence_privilege('authenticated','private.public_search_budget','update'),'authenticated cannot reset budget');
select ok(not has_function_privilege('anon','private.claim_public_search_budget()','execute'),'private admission cannot be called directly');
-- Public projection and page contracts use isolated source rows, not mocks.
insert into public.sections(id,name,slug) values('2c000000-0000-0000-0000-000000000046','Searchsection','public-search-section');
insert into public.profiles(id,display_name,slug) values('1c000000-0000-0000-0000-000000000046','Searchowner','public-search-owner');
insert into public.articles(id,owner_profile_id,section_id,title,slug,excerpt,content,status,published_at,archived_at)
select ('5c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '1c000000-0000-0000-0000-000000000046','2c000000-0000-0000-0000-000000000046',
 'Publicneedle story '||n,'public-search-story-'||n,'Public excerpt',
 '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Bodyneedle secrettext"}]}]}}',
 case when n=14 then 'draft'::public.article_status when n=15 then 'archived'::public.article_status else 'published'::public.article_status end,
 case when n=1 then '2025-12-31T23:59:59Z'::timestamptz
      when n!=14 then '2026-11-10T00:00:00.123456Z'::timestamptz else null end,
 case when n=15 then now() else null end from generate_series(1,15) n;
create temp table search_pages(label text primary key,result jsonb);
grant select,insert on search_pages to anon,authenticated;
set local role anon;
insert into search_pages values('first',public.search_public_articles('Publicneedle'));
insert into search_pages select 'second',public.search_public_articles('Publicneedle',12,result->'nextCursor') from search_pages where label='first';
reset role;
select is((select result->>'kind' from search_pages where label='first'),'ok','anonymous may search published stories');
select is((select jsonb_array_length(result->'items') from search_pages where label='first'),12,'default page bounded to twelve');
select is((select result#>>'{items,0,id}' from search_pages where label='first'),'5c000000-0000-0000-0000-000000000013','UUID tie-break is descending at exact microseconds');
select is((select result#>>'{nextCursor,publishedAt}' from search_pages where label='first'),'2026-11-10T00:00:00.123456Z','cursor preserves six microseconds');
select is((select jsonb_array_length(result->'items') from search_pages where label='second'),1,'continuation excludes repeated and private articles');
select is((select result#>>'{items,0,id}' from search_pages where label='second'),'5c000000-0000-0000-0000-000000000001','second page contains only oldest tie');
select is((select result#>>'{items,0,publishedAt}' from search_pages where label='second'),
 '2025-12-31T23:59:59.000000Z','backdated published article sorts after current search results');
select is((select result->'nextCursor' from search_pages where label='second'),'null'::jsonb,'exhaustion has no cursor');
select ok((select bool_and(not exists(select 1 from jsonb_object_keys(card) k where k not in ('id','slug','title','excerpt','publishedAt','section','owner','writers','mainImage'))) from search_pages,jsonb_array_elements(result->'items') card),'cards expose only allowlisted fields');
select unalike((select result::text from search_pages where label='first'),'%secrettext%','body match text never becomes a snippet');
set local role authenticated;
insert into search_pages values('authenticated',public.search_public_articles('Publicneedle'));
reset role;
select is((select result from search_pages where label='authenticated'),(select result from search_pages where label='first'),'authenticated result has no extra private data');
select is(jsonb_array_length(public.search_public_articles('Bodyneedle Searchowner Searchsection',24)->'items'),13,'all words span current body and labels without duplicate cards');
select is(jsonb_array_length(public.search_public_articles('zzabsentneedle')->'items'),0,'empty search is a successful empty page');
select is(public.search_public_articles('Otherneedle',12,(select result->'nextCursor' from search_pages where label='first'))->>'kind','invalid','cursor cannot cross queries');
select is(public.search_public_articles('Publicneedle',12,(select result->'nextCursor'||'{"extra":true}' from search_pages where label='first'))->>'kind','invalid','cursor rejects extra fields');
select is(public.search_public_articles('Publicneedle',12,'{"version":1,"query":"Publicneedle","publishedAt":"2026-02-30T00:00:00.000000Z","id":"5c000000-0000-0000-0000-000000000001"}')->>'kind','invalid','impossible cursor date rejected');
select is(public.search_public_articles('Publicneedle',25)->>'kind','invalid','public limit cannot exceed twenty-four');
update public.profiles set display_name='Renamedowner' where slug='public-search-owner';
select is(jsonb_array_length(public.search_public_articles('Searchowner')->'items'),0,'old label vanishes immediately');
select is(jsonb_array_length(public.search_public_articles('Renamedowner',24)->'items'),13,'new label is searchable without source fan-out');
update public.articles set title='Editedneedle',content=null where slug='public-search-story-13';
select is(jsonb_array_length(public.search_public_articles('Editedneedle')->'items'),1,'published edit and legacy-null body are safe');
update public.articles set status='archived',archived_at=now() where slug='public-search-story-13';
select is(jsonb_array_length(public.search_public_articles('Editedneedle')->'items'),0,'archived edit disappears immediately');
update public.articles set status='published',archived_at=null where slug='public-search-story-13';
select is(jsonb_array_length(public.search_public_articles('Editedneedle')->'items'),1,'restored current title reappears');
update public.profiles set active=false where slug='public-search-owner';
select is(jsonb_array_length(public.search_public_articles('Publicneedle')->'items'),0,'inactive owner never leaks published cards');
update public.profiles set active=true where slug='public-search-owner';
update public.sections set active=false where slug='public-search-section';
select is(jsonb_array_length(public.search_public_articles('Publicneedle')->'items'),0,'inactive section never leaks published cards');
-- Budget tests avoid straddling a real window boundary, including slow CI hosts.
select pg_sleep(case when extract(second from clock_timestamp())>45 then 61-extract(second from clock_timestamp()) else 0 end);
select setval('private.public_search_budget',floor(extract(epoch from clock_timestamp())/60)::bigint*128,true);
create temp table quota_base as select last_value from private.public_search_budget;
select is(public.search_public_articles('!!!')->>'kind','invalid','invalid query still rejected with fresh budget');
select is(public.search_public_articles('word',0)->>'kind','invalid','invalid limit spends no quota');
select is((select last_value from private.public_search_budget),(select last_value from quota_base),'invalid requests spend no tickets');
select is((select count(*)::int from generate_series(1,80) n where public.search_public_articles('zzabsentneedle')->>'kind'='ok'),80,'exactly 80 attempts admitted in window');
select is(public.search_public_articles('word')->>'kind','rate_limited','attempt 81 is denied');
select ok((public.search_public_articles('word')->>'retryAfter')::int between 1 and 60,'retry duration is bounded server time');
select is((select last_value from private.public_search_budget),(select last_value+80 from quota_base),'rejected attempts do not increment saturated sequence');
select setval('private.public_search_budget',(select last_value-128+80 from quota_base),true);
select is(public.search_public_articles('word')->>'kind','ok','expired full window rolls over');
select is((select last_value from private.public_search_budget),(select last_value+1 from quota_base),'new window counts one ticket');
savepoint lost_response;
select public.search_public_articles('word');
rollback to lost_response;
select is((select last_value from private.public_search_budget),(select last_value+2 from quota_base),'ordinary rollback cannot refund admitted ticket');
select setval('private.public_search_budget',(select last_value+256 from quota_base),true);
select is(public.search_public_articles('word')->>'kind','rate_limited','future clock state fails closed');
select is((select last_value from private.public_search_budget),(select last_value+256 from quota_base),'clock regression never rewinds counter');
select set_config('request.path','/rpc/another_rpc',true);
select is(public.search_public_articles('word')->>'kind','invalid','nested transport cannot bypass hoisted deadline');
select set_config('request.path','/rpc/search_public_articles',true);
select set_config('request.method','GET',true);
select is(public.search_public_articles('word')->>'kind','invalid','GET cannot run admitted search');
select ok((select bool_and(not rolcanlogin) from pg_roles where rolname in ('anon','authenticated')),'public roles cannot log in and forge request GUCs');
select is(current_setting('response.headers'),'[{"Cache-Control":"no-store"}]','invalid and limited responses remain no-store');
select setval('private.public_search_budget',(select last_value from budget_before),(select is_called from budget_before));
select * from finish();
rollback;
