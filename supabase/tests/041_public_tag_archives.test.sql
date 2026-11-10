begin;
select no_plan();
insert into public.sections(id,name,slug,active) values
 ('2e000000-0000-0000-0000-000000000001','Tag proof news','tag-proof-news',true),
 ('2e000000-0000-0000-0000-000000000002','Tag proof sports','tag-proof-sports',true),
 ('2e000000-0000-0000-0000-000000000003','Tag proof hidden','tag-proof-hidden',false);
insert into public.profiles(id,display_name,slug,active) values
 ('1e000000-0000-0000-0000-000000000001','Inactive tag proof owner','inactive-tag-proof-owner',true);
insert into public.tags(id,name,slug) values
 ('4e000000-0000-0000-0000-000000000001','Tag proof topic','tag-proof-topic'),
 ('4e000000-0000-0000-0000-000000000002','Tag proof empty','tag-proof-empty'),
 ('4e000000-0000-0000-0000-000000000003','Tag proof other','tag-proof-other');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at)
select ('5e000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case when n=4 then '1e000000-0000-0000-0000-000000000001'::uuid else '10000000-0000-0000-0000-000000000002'::uuid end,
 case n when 2 then '2e000000-0000-0000-0000-000000000002'::uuid when 3 then '2e000000-0000-0000-0000-000000000003'::uuid else '2e000000-0000-0000-0000-000000000001'::uuid end,
 'Tag proof story '||n,'tag-proof-story-'||n,
 case n when 5 then 'draft'::public.article_status when 6 then 'archived'::public.article_status else 'published'::public.article_status end,
 case when n!=5 then '2026-11-10T00:00:00Z'::timestamptz+n*interval '1 microsecond' else null end,
 case when n=6 then now() else null end from generate_series(1,7) n;
insert into public.article_tags(article_id,tag_id)
 select id,'4e000000-0000-0000-0000-000000000001' from public.articles where slug like 'tag-proof-story-%' and slug!='tag-proof-story-7';
insert into public.article_tags(article_id,tag_id) values
 ('5e000000-0000-0000-0000-000000000001','4e000000-0000-0000-0000-000000000003'),
 ('5e000000-0000-0000-0000-000000000007','4e000000-0000-0000-0000-000000000003');
insert into public.article_contributors(article_id,profile_id,contribution_role) values
 ('5e000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','writer'),
 ('5e000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','editor'),
 ('5e000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','writer');
-- Simulate a legacy stale reference through privileged fixture setup. The
-- checked application deactivation/publication operations remain unchanged.
update public.profiles set active=false where id='1e000000-0000-0000-0000-000000000001';
create temp table tag_proof(value jsonb);
grant all on tag_proof to anon,authenticated;
set local role anon;
select is((select name from public.tags where slug='tag-proof-topic'),'Tag proof topic','existing policy permits anonymous tag label reads');
insert into tag_proof select public.list_public_articles('tag','tag-proof-topic',null,1,null);
select is(jsonb_array_length(public.list_public_articles('tag','tag-proof-topic',null,24,null)->'items'),2,'only published active-section active-owner stories are public');
select is((select count(distinct value->'section'->>'slug')::int from jsonb_array_elements(public.list_public_articles('tag','tag-proof-topic',null,24,null)->'items')),2,'one tag spans both active sections');
select is((select count(distinct value->>'id')::int from jsonb_array_elements(public.list_public_articles('tag','tag-proof-topic',null,24,null)->'items')),2,'multiple tags and contributor roles do not duplicate stories');
select is(jsonb_array_length(public.list_public_articles('tag','tag-proof-empty',null,24,null)->'items'),0,'existing unused tag is an empty archive');
select is(public.list_public_articles('tag','tag-proof-other',null,1,(select value->'nextCursor' from tag_proof))->>'kind','invalid','cursor cannot cross tag identity');
select is(public.list_public_articles('section','tag-proof-news',null,1,(select value->'nextCursor' from tag_proof))->>'kind','invalid','tag cursor cannot cross scope kind');
select is(public.list_public_articles('tag','tag-proof-topic',null,1,(select value->'nextCursor' from tag_proof))#>>'{items,0,slug}','tag-proof-story-1','next page retains matching tag only');
select is(public.list_public_articles('tag','tag-proof-topic',null,1,(select value->'nextCursor' from tag_proof))->'nextCursor','null'::jsonb,'last page has no invented continuation');
select ok(not has_table_privilege('anon','public.article_tags','select'),'direct private associations remain denied');
reset role;
set local role authenticated;
select is(public.list_public_articles('tag','tag-proof-topic',null,1,null),(select value from tag_proof),'signed-in and anonymous tag lists are identical');
reset role;
delete from public.article_tags where article_id='5e000000-0000-0000-0000-000000000001' and tag_id='4e000000-0000-0000-0000-000000000001';
set local role anon;
select is(jsonb_array_length(public.list_public_articles('tag','tag-proof-topic',null,1,(select value->'nextCursor' from tag_proof))->'items'),0,'removed association disappears on next request');
reset role;
select * from finish();
rollback;
