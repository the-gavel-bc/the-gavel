begin;
select no_plan();
update private.media_cleanup_runtime set last_healthy_at=clock_timestamp() where id=true;
select has_function('public','delete_archived_article',array['uuid','integer','uuid','boolean'],'checked deletion exists');
select ok(not has_function_privilege('anon','public.delete_archived_article(uuid,integer,uuid,boolean)','EXECUTE'),'anonymous cannot delete');
select ok(not has_table_privilege('authenticated','public.articles','DELETE'),'direct article deletion denied');
update auth.users set email='delete-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(), raw_app_meta_data='{"provider":"google"}'::jsonb
  where id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
insert into public.sections(id,name,slug) values('84000000-0000-0000-0000-000000000001','Deletion test','deletion-test');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at) values
 ('84000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000001','Deletion story','deletion-story','archived',now(),now()),
 ('84000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000001','Media story','deletion-media-story','archived',now(),now()),
 ('84000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000001','Published story','deletion-published','published',now(),null);
insert into public.article_revisions(article_id,actor_user_id,snapshot) values('84000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','{}');
insert into public.homepage_selections(group_name,position,article_id) values('lead',1,'84000000-0000-0000-0000-000000000002');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key) values('84000000-0000-0000-0000-000000000004','84000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000005','delete-test-object');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000002',1,'84000000-0000-0000-0000-000000000009',true)->>'code','forbidden','inactive membership cannot delete');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000002',1,'84000000-0000-0000-0000-000000000010',true)->>'code','forbidden','author cannot delete');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000002',1,'84000000-0000-0000-0000-000000000011',false)->>'code','invalid_input','explicit confirmation required');
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000006',1,'84000000-0000-0000-0000-000000000021',true)->>'code','conflict','published article cannot be deleted');
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000002',2,'84000000-0000-0000-0000-000000000012',true)->>'code','conflict','stale version rejected');
reset role;
alter table public.audit_events add constraint task15_force_failure check(action <> 'article.deleted') not valid;
set local role authenticated;
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000002',1,'84000000-0000-0000-0000-000000000022',true)->>'code','unavailable','audit failure is reported safely');
reset role;
alter table public.audit_events drop constraint task15_force_failure;
select is((select count(*)::int from public.articles where id='84000000-0000-0000-0000-000000000002'),1,'failed deletion preserves article');
select is((select count(*)::int from public.article_revisions where article_id='84000000-0000-0000-0000-000000000002'),1,'failed deletion preserves revisions');
select is((select count(*)::int from public.homepage_selections where article_id='84000000-0000-0000-0000-000000000002'),1,'failed deletion preserves homepage selection');
set local role authenticated;
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000002',1,'84000000-0000-0000-0000-000000000014',true)->>'ok','true','administrator deletes archived article');
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000002',1,'84000000-0000-0000-0000-000000000014',true)->>'replayed','true','retry returns receipt after deletion');
select is(public.delete_archived_article('84000000-0000-0000-0000-000000000006',1,'84000000-0000-0000-0000-000000000014',true)->>'code','request_conflict','request cannot be reused for another article');
select is((select count(*)::int from public.list_article_audit_events(20,'article.deleted') where resource_id='84000000-0000-0000-0000-000000000002'),1,'deleted article appears in audit history');
reset role;
select is((select count(*)::int from public.articles where id='84000000-0000-0000-0000-000000000002'),0,'article removed');
select is((select count(*)::int from public.article_revisions where article_id='84000000-0000-0000-0000-000000000002'),0,'revisions removed');
select is((select count(*)::int from public.homepage_selections where article_id='84000000-0000-0000-0000-000000000002'),0,'homepage reference removed');
select is((select count(*)::int from public.audit_events where action='article.deleted' and resource_id='84000000-0000-0000-0000-000000000002'),1,'one deletion audit survives');
select isnt(private.allocate_article_slug('Deletion story'), 'deletion-story','deleted public slug remains reserved');
select is((select count(*)::int from public.audit_events where action='homepage.updated' and correlation_id='84000000-0000-0000-0000-000000000014'),1,'homepage selection removal audited');
select is((select count(*)::int from auth.users where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004')),2,'auth accounts retained');
-- An original create retry remains a tombstone and must not recreate deleted content.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('test.created_article',public.create_article_draft('84000000-0000-0000-0000-000000000025',
 '{"schemaVersion":1,"title":"Created then deleted","sectionId":"84000000-0000-0000-0000-000000000001","excerpt":null,"content":null,"seoKeyphrase":null,"metaDescription":null,"categoryIds":[],"tagIds":[],"contributors":[]}'::jsonb)->>'articleId',true);
reset role;
update public.articles set status='archived',published_at=now(),archived_at=now() where id=current_setting('test.created_article')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.delete_archived_article(current_setting('test.created_article')::uuid,1,'84000000-0000-0000-0000-000000000026',true)->>'ok','true','created fixture can be deleted');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.create_article_draft('84000000-0000-0000-0000-000000000025',
 '{"schemaVersion":1,"title":"Created then deleted","sectionId":"84000000-0000-0000-0000-000000000001","excerpt":null,"content":null,"seoKeyphrase":null,"metaDescription":null,"categoryIds":[],"tagIds":[],"contributors":[]}'::jsonb)->>'code','not_found','old create retry cannot resurrect deleted article');
reset role;
select is((select count(*)::int from public.articles where id=current_setting('test.created_article')::uuid),0,'retry did not recreate deleted article');
select * from finish();
rollback;
