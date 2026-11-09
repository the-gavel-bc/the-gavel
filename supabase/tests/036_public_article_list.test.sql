begin;
select no_plan();
select has_function('public','list_public_articles',array['text','text','text','integer','jsonb'],'public article list projection exists');
select ok(has_function_privilege('anon','public.list_public_articles(text,text,text,integer,jsonb)','execute'),'anonymous can list');
select ok(has_function_privilege('authenticated','public.list_public_articles(text,text,text,integer,jsonb)','execute'),'authenticated can list');
select ok(not has_table_privilege('anon','public.articles','select'),'anonymous direct article reads remain denied');
insert into public.sections(id,name,slug) values ('23000000-0000-0000-0000-000000000036','List proof section','list-proof');
insert into public.categories(id,section_id,name,slug) values ('33000000-0000-0000-0000-000000000036','23000000-0000-0000-0000-000000000036','List proof category','list-category');
insert into public.tags(id,name,slug) values ('43000000-0000-0000-0000-000000000036','List proof tag','list-tag');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,content)
select ('53000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '10000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000036',
 'List story '||n,'list-story-'||n,'published',
 '2026-01-01T00:00:00.123456Z'::timestamptz + (case when n=3 then interval '1 microsecond' else interval '0' end),
 '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph"}]}}'
from generate_series(1,3) n;
insert into public.articles(id,owner_profile_id,section_id,title,slug)
values('53000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002',
 '23000000-0000-0000-0000-000000000036','Secret draft','list-secret');
insert into public.article_categories(article_id,category_id,section_id)
select id,'33000000-0000-0000-0000-000000000036',section_id from public.articles where slug like 'list-story-%';
insert into public.article_tags(article_id,tag_id)
select id,'43000000-0000-0000-0000-000000000036' from public.articles where slug like 'list-story-%';
insert into public.article_contributors(article_id,profile_id,contribution_role)
values ('53000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','writer'),
 ('53000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','editor');
create temporary table list_proof(value jsonb);
grant select,insert on list_proof to anon,authenticated;
set local role anon;
insert into list_proof select public.list_public_articles('section','list-proof',null,2,null);
select is((select value->>'kind' from list_proof),'ok','published section page is available');
select is((select jsonb_array_length(value->'items') from list_proof),2,'requested page size returned');
select is((select value#>>'{items,0,slug}' from list_proof),'list-story-3','microsecond ordering preserved');
select is((select value#>>'{items,1,slug}' from list_proof),'list-story-2','uuid breaks equal timestamp ties');
select is((select value#>>'{nextCursor,publishedAt}' from list_proof),'2026-01-01T00:00:00.123456Z','cursor preserves microseconds');
select is(public.list_public_articles('section','list-proof',null,2,(select value->'nextCursor' from list_proof))#>>'{items,0,slug}',
 'list-story-1','continuation returns remaining article');
select is(public.list_public_articles('section','other',null,2,(select value->'nextCursor' from list_proof))->>'kind','invalid','cursor cannot cross filters');
select is(public.list_public_articles('section','list-proof',null,25,null)->>'kind','invalid','oversized page rejected');
select is(public.list_public_articles('section','list-proof',null,0,null)->>'kind','invalid','zero page rejected');
select is(public.list_public_articles('section','list-proof',null,2,'[]'::jsonb)->>'kind','invalid','non-object cursor rejected');
select is(public.list_public_articles('section','list-proof',null,2,'{"version":1}'::jsonb)->>'kind','invalid','incomplete cursor rejected');
select is(public.list_public_articles('section','list-proof',null,2,
 jsonb_set((select value->'nextCursor' from list_proof),'{publishedAt}','"2026-02-30T00:00:00.123456Z"'))->>'kind','invalid','impossible timestamp rejected safely');
select is(public.list_public_articles('section','list-proof',null,2,
 jsonb_set((select value->'nextCursor' from list_proof),'{publishedAt}','"2026-01-01T24:00:00.000000Z"'))->>'kind','invalid','noncanonical clock value rejected');
select is(jsonb_array_length(public.list_public_articles('category','list-proof','list-category',24,null)->'items'),3,'category filter finds published stories');
select is(jsonb_array_length(public.list_public_articles('tag','list-tag',null,24,null)->'items'),3,'tag filter finds published stories');
select is(jsonb_array_length(public.list_public_articles('section','missing',null,24,null)->'items'),0,'unknown filter is empty');
select ok((select value::text from list_proof) !~ 'content|owner_profile_id|auth_user_id|object_key|list-secret','cards exclude bodies and private data');
select throws_ok($$select * from public.articles$$,'42501',null,'anonymous table read denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.list_public_articles('section','list-proof',null,2,null),(select value from list_proof),'authenticated and anonymous outputs match');
reset role;
set local role anon;
select is(jsonb_array_length(public.list_public_articles('author',(select slug from public.profiles where id='10000000-0000-0000-0000-000000000002'),null,24,null)->'items'),3,'owner with multiple credits is not duplicated');
reset role;
update public.categories set active=false where slug='list-category';
set local role anon;
select is(jsonb_array_length(public.list_public_articles('category','list-proof','list-category',24,null)->'items'),0,'inactive category is hidden');
reset role;
update public.articles set status='archived',archived_at=now() where slug='list-story-1';
set local role anon;
select is(jsonb_array_length(public.list_public_articles('section','list-proof',null,2,(select value->'nextCursor' from list_proof))->'items'),0,'archive before next request removes the article');
reset role;
update public.articles set status='published',published_at='2026-01-02T00:00:00Z' where slug='list-secret';
set local role anon;
select is(jsonb_array_length(public.list_public_articles('section','list-proof',null,2,(select value->'nextCursor' from list_proof))->'items'),0,'newer publication does not duplicate an earlier page');
reset role;
select * from finish();
rollback;
