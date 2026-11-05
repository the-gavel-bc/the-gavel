begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc

create function pg_temp.ready_input(p_patch jsonb default '{}') returns jsonb language sql as $$
select pg_temp.draft_input(jsonb_build_object('content','{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ready story"}]}]}}'::jsonb) || p_patch);
$$;
create temp table lifecycle_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000901',pg_temp.ready_input())->>'articleId')::uuid article_id;
grant select on lifecycle_target to authenticated;
create function pg_temp.publish(v integer,r uuid) returns jsonb language sql as $$
  select public.publish_article((select article_id from lifecycle_target),v,r);
$$;
create function pg_temp.archive(v integer,r uuid) returns jsonb language sql as $$
  select public.archive_article((select article_id from lifecycle_target),v,r);
$$;
select has_function('public','publish_article',array['uuid','integer','uuid'],'publish boundary exists');
select has_function('public','archive_article',array['uuid','integer','uuid'],'archive boundary exists');
select ok(not has_function_privilege('anon','public.publish_article(uuid,integer,uuid)','EXECUTE'),
  'anonymous cannot publish');
select ok(not has_function_privilege('anon','public.archive_article(uuid,integer,uuid)','EXECUTE'),
  'anonymous cannot archive');
select ok(not has_table_privilege('authenticated','public.articles','UPDATE'),
  'client cannot directly change status');
create temp table lifecycle_results(label text primary key,result jsonb);
grant select,insert on lifecycle_results to authenticated;

set local role authenticated;
insert into lifecycle_results values('missing_image',pg_temp.publish(1,gen_random_uuid()));
reset role;
select is((select result->>'code' from lifecycle_results where label='missing_image'),'invalid_input',
  'main image required for publication');
select is((select status::text from public.articles),'draft','failed readiness leaves draft unchanged');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at)
select '60000000-0000-0000-0000-000000000901',article_id,
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000902',
  'lifecycle/901.webp','finalized',1234,120,90,repeat('a',64),now() from lifecycle_target;
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000000901','Newsroom','The Gavel' from lifecycle_target;
update public.articles set content=null where id=(select article_id from lifecycle_target);
set local role authenticated;
insert into lifecycle_results values('empty_body',pg_temp.publish(1,gen_random_uuid()));
reset role;
select is((select result->>'code' from lifecycle_results where label='empty_body'),'invalid_input',
  'empty body cannot publish');
update public.articles set content='{"legacy":true}'::jsonb where id=(select article_id from lifecycle_target);
set local role authenticated;
insert into lifecycle_results values('unsupported_body',pg_temp.publish(1,gen_random_uuid()));
reset role;
select is((select result->>'code' from lifecycle_results where label='unsupported_body'),'unsupported_content',
  'unsupported stored body cannot publish');
update public.articles set content=pg_temp.ready_input()->'content' where id=(select article_id from lifecycle_target);
insert into public.article_categories(article_id,category_id,section_id)
select article_id,'30000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051' from lifecycle_target;
update public.categories set active=false where id='30000000-0000-0000-0000-000000000051';
set local role authenticated;
insert into lifecycle_results values('inactive_category',pg_temp.publish(1,gen_random_uuid()));
reset role;
select is((select result->>'code' from lifecycle_results where label='inactive_category'),'invalid_input',
  'inactive selected category cannot publish');
update public.categories set active=true where id='30000000-0000-0000-0000-000000000051';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into lifecycle_results values('other_publish',pg_temp.publish(1,gen_random_uuid()));
reset role;
select is((select result->>'code' from lifecycle_results where label='other_publish'),'not_found',
  'other owner cannot publish');
insert into public.article_contributors(article_id,profile_id,contribution_role)
select article_id,'10000000-0000-0000-0000-000000000003','writer' from lifecycle_target;
set local role authenticated;
insert into lifecycle_results values('credited_publish',pg_temp.publish(1,gen_random_uuid()));
reset role;
select is((select result->>'code' from lifecycle_results where label='credited_publish'),'not_found',
  'credit grants no publish authority');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
insert into lifecycle_results values('inactive_publish',pg_temp.publish(1,gen_random_uuid()));
reset role;
select is((select result->>'code' from lifecycle_results where label='inactive_publish'),'forbidden',
  'inactive owner cannot publish');
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000002';

create temp table original_identity as select slug,owner_profile_id from public.articles
  where id=(select article_id from lifecycle_target);
set local role authenticated;
insert into lifecycle_results values('published',pg_temp.publish(1,'80000000-0000-0000-0000-000000000903'));
insert into lifecycle_results values('publish_retry',pg_temp.publish(1,'80000000-0000-0000-0000-000000000903'));
insert into lifecycle_results values('publish_wrong_status',pg_temp.publish(2,gen_random_uuid()));
insert into lifecycle_results values('archive_reuse',pg_temp.archive(2,'80000000-0000-0000-0000-000000000903'));
insert into lifecycle_results values('archive_stale',pg_temp.archive(1,gen_random_uuid()));
reset role;
select is((select result->>'status' from lifecycle_results where label='published'),'published',
  'ready owner draft publishes');
select is((select result->>'version' from lifecycle_results where label='published'),'2','publish advances version once');
select is((select result->>'replayed' from lifecycle_results where label='publish_retry'),'true',
  'exact publish retry replays');
select is((select result->>'code' from lifecycle_results where label='publish_wrong_status'),'conflict',
  'published article cannot publish again');
select is((select result->>'code' from lifecycle_results where label='archive_reuse'),'request_conflict',
  'another operation cannot reuse request ID');
select is((select result->>'code' from lifecycle_results where label='archive_stale'),'conflict',
  'stale archive rejected');
select is((select status::text from public.articles),'published','article is published');
select ok((select published_at is not null from public.articles),'first publication timestamp set');
select is((select archived_at from public.articles),null::timestamptz,'publish does not archive');
select is((select slug from public.articles),(select slug from original_identity),'publish preserves slug');
select is((select owner_profile_id from public.articles),(select owner_profile_id from original_identity),
  'publish preserves owner');
select is((select count(*)::integer from public.article_revisions),2,'publish captures one revision');
select is((select count(*)::integer from public.audit_events where action='article.published'),1,
  'publish captures one audit event');
create temp table first_publication as select published_at from public.articles;

set local role authenticated;
insert into lifecycle_results values('archived',pg_temp.archive(2,'80000000-0000-0000-0000-000000000904'));
insert into lifecycle_results values('archive_retry',pg_temp.archive(2,'80000000-0000-0000-0000-000000000904'));
insert into lifecycle_results values('archive_wrong_status',pg_temp.archive(3,gen_random_uuid()));
reset role;
select is((select result->>'status' from lifecycle_results where label='archived'),'archived',
  'owner archives published article');
select is((select result->>'version' from lifecycle_results where label='archived'),'3','archive advances version once');
select is((select result->>'replayed' from lifecycle_results where label='archive_retry'),'true',
  'exact archive retry replays');
select is((select result->>'code' from lifecycle_results where label='archive_wrong_status'),'conflict',
  'archived article cannot archive again');
select is((select published_at from public.articles),(select published_at from first_publication),
  'archive preserves original publication timestamp');
select ok((select archived_at is not null from public.articles),'archive timestamp set');
select is((select count(*)::integer from public.article_revisions),3,'archive captures one revision');
select is((select count(*)::integer from public.audit_events where action='article.archived'),1,
  'archive captures one audit event');
select is(pg_temp.publish(1,'80000000-0000-0000-0000-000000000903')->>'version','2',
  'old publish retry returns original version after archive');
select is((select status::text from public.articles),'archived','old retry never reopens article');
select * from finish();
rollback;
