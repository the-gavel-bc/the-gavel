begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create temp table target as select (public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'articleId')::uuid id;
create function pg_temp.save_input(p_patch jsonb,p_version integer) returns jsonb language sql as $$
select public.save_article_draft((select id from target),p_version,gen_random_uuid(),pg_temp.draft_input(p_patch));
$$;
create temp table selections as select '{"categoryIds":["30000000-0000-0000-0000-000000000051"],"tagIds":["40000000-0000-0000-0000-000000000051"],"contributors":[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":2},{"profileId":"10000000-0000-0000-0000-000000000051","role":"editor","displayOrder":2}]}'::jsonb patch;
select is(pg_temp.save_input((select patch from selections),1)->>'version','2','save persists full selections');
select is((select count(*)::integer from public.article_categories),1,'category linked');
select is((select count(*)::integer from public.article_tags),1,'tag linked');
select is((select count(*)::integer from public.article_contributors),2,'guest may hold distinct roles and tied orders');
select is(pg_temp.save_input((select jsonb_set(patch,'{contributors}',jsonb_build_array(patch #> '{contributors,1}',patch #> '{contributors,0}')) from selections),2)->>'changed','false','pure credit array reorder is a semantic no-op');
update public.categories set active=false where id='30000000-0000-0000-0000-000000000051';
select is(pg_temp.save_input((select patch from selections),2)->>'code','invalid_input','existing inactive selection blocks otherwise identical save');
select is((select count(*)::integer from public.article_categories),1,'rejection does not silently drop inactive selection');
update public.sections set active=true where id='20000000-0000-0000-0000-000000000052';
select is(pg_temp.save_input('{"sectionId":"20000000-0000-0000-0000-000000000052","categoryIds":["30000000-0000-0000-0000-000000000052"],"excerpt":"Replaced metadata"}',2)->>'version','3','deliberate remove/change/reattach is atomic');
select is((select category_id from public.article_categories),'30000000-0000-0000-0000-000000000052'::uuid,'new matching category attached');
select is((select count(*)::integer from public.article_tags),0,'removed tags stay removed');
select is((select count(*)::integer from public.article_contributors),0,'removed credits stay removed');
select is((select snapshot #>> '{article,excerpt}' from public.article_revisions where snapshot #>> '{article,editVersion}'='3'),'Replaced metadata','snapshot captures committed metadata');
select is((select snapshot->'categoryIds' from public.article_revisions where snapshot #>> '{article,editVersion}'='3'),'["30000000-0000-0000-0000-000000000052"]'::jsonb,'snapshot captures replaced selections');
select * from finish();
rollback;
