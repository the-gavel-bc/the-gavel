begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
insert into public.articles(id,owner_profile_id,section_id,title,slug,content) values
('50000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000051','Synthetic Snapshot','synthetic-snapshot','{"legacy":"preserved"}');
insert into public.article_categories values ('50000000-0000-0000-0000-000000000051','30000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051');
insert into public.article_tags values ('50000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051');
insert into public.article_contributors values ('50000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','writer',3);
select is(private.capture_draft_snapshot('50000000-0000-0000-0000-000000000051')->>'format','gavel-article-snapshot','snapshot has a versioned closed envelope');
create temp table captured as select private.capture_draft_snapshot('50000000-0000-0000-0000-000000000051') value;
select is((select value->'version' from captured),'1'::jsonb,'snapshot format version is one');
select is((select value #> '{article,content}' from captured),'{"legacy":"preserved"}'::jsonb,'capture does not transform stored body');
select is((select value #>> '{article,ownerProfileId}' from captured),'10000000-0000-0000-0000-000000000002','snapshot retains committed owner');
select is((select value #> '{article,editVersion}' from captured),'1'::jsonb,'snapshot includes edit version');
select is((select value->'categoryIds' from captured),'["30000000-0000-0000-0000-000000000051"]'::jsonb,'snapshot captures complete categories');
select is((select value->'tagIds' from captured),'["40000000-0000-0000-0000-000000000051"]'::jsonb,'snapshot captures complete tags');
select is((select value->'contributors' from captured),'[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":3}]'::jsonb,'snapshot captures complete credits');
select is((select count(*)::integer from captured,jsonb_object_keys(value->'article')),15,'snapshot article fields are explicitly closed');
select is(private.capture_draft_snapshot('50000000-0000-0000-0000-000000000099'),null::jsonb,'missing resource has no snapshot');
select ok(not has_function_privilege(role,'private.capture_draft_snapshot(uuid)','EXECUTE'),role||' cannot capture arbitrary articles') from unnest(array['anon','authenticated']) role;
select * from finish();
rollback;
