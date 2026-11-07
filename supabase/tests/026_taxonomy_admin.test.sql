begin;
select no_plan();
select has_function('public','update_section_taxonomy',
  array['uuid','integer','uuid','text','integer','boolean'],'checked section update exists');
select has_function('public','update_category_taxonomy',
  array['uuid','integer','uuid','text','integer','boolean'],'checked category update exists');
select ok(not has_table_privilege('authenticated','public.sections','UPDATE'),
  'direct section writes remain closed');
select ok(not has_table_privilege('authenticated','public.tags','UPDATE'),
  'direct tag writes remain closed');
update auth.users set email='task11-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'::jsonb where id='00000000-0000-0000-0000-000000000004';
update auth.users set email='task11-author@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'::jsonb where id='00000000-0000-0000-0000-000000000002';
insert into public.sections(id,name,slug) values
  ('81000000-0000-0000-0000-000000000001','Task 11 section','task11-section'),
  ('81000000-0000-0000-0000-000000000002','Task 11 empty','task11-empty');
insert into public.categories(id,section_id,name,slug) values
  ('81000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000001','Task 11 category','task11-category'),
  ('81000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000002','Outside of BC','outside-of-bc');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
  values('81000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000001','Task 11 story','task11-story','published',now());
insert into public.article_categories(article_id,category_id,section_id)
  values('81000000-0000-0000-0000-000000000005','81000000-0000-0000-0000-000000000003',
    '81000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((public.update_section_taxonomy('81000000-0000-0000-0000-000000000001',1,
  '81000000-0000-0000-0000-000000000011','Changed',0,true)->>'code'),
  'forbidden','author cannot update section');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((public.update_section_taxonomy('81000000-0000-0000-0000-000000000001',1,
  '81000000-0000-0000-0000-000000000012','Task 11 section',0,false)->>'code'),
  'conflict','published section cannot be deactivated');
select is((public.update_category_taxonomy('81000000-0000-0000-0000-000000000003',1,
  '81000000-0000-0000-0000-000000000013','Task 11 category',0,false)->>'code'),
  'conflict','published category cannot be deactivated');
select is((public.update_category_taxonomy('81000000-0000-0000-0000-000000000004',1,
  '81000000-0000-0000-0000-000000000014','Off Campus',0,true)->>'code'),
  'conflict','unresolved Outside of BC label cannot be renamed');
select is((public.update_section_taxonomy('81000000-0000-0000-0000-000000000002',1,
  '81000000-0000-0000-0000-000000000015','Task 11 renamed',2,false)->>'version'),
  '2','unreferenced section update increments version');
select is((public.update_section_taxonomy('81000000-0000-0000-0000-000000000002',1,
  '81000000-0000-0000-0000-000000000015','Task 11 renamed',2,false)->>'replayed'),
  'true','exact update replays');
select is((public.update_section_taxonomy('81000000-0000-0000-0000-000000000002',1,
  '81000000-0000-0000-0000-000000000015','Different',2,false)->>'code'),
  'request_conflict','request ID cannot carry changed input');
select is((public.update_section_taxonomy('81000000-0000-0000-0000-000000000002',1,
  '81000000-0000-0000-0000-000000000016','Stale',0,true)->>'code'),
  'conflict','stale section edit rejected');
select is((public.update_category_taxonomy('81000000-0000-0000-0000-000000000004',1,
  '81000000-0000-0000-0000-000000000017','Outside of BC',0,true)->>'code'),
  'conflict','category cannot activate beneath inactive section');
select is((public.update_section_taxonomy('81000000-0000-0000-0000-000000000002',2,
  '81000000-0000-0000-0000-000000000018','Task 11 renamed',2,false)->>'changed'),
  'false','no-op records no changed event');
reset role;
select is((select slug from public.sections where id='81000000-0000-0000-0000-000000000002'),
  'task11-empty','section slug is retained after rename');
select is((select count(*)::integer from public.audit_events where resource_type='section'
  and resource_id='81000000-0000-0000-0000-000000000002'),1,
  'only changed update has audit event');
update public.articles set status='archived',archived_at=now()
  where id='81000000-0000-0000-0000-000000000005';
set local role authenticated;
select is((public.update_category_taxonomy('81000000-0000-0000-0000-000000000003',1,
  '81000000-0000-0000-0000-000000000019','Task 11 category',0,false)->>'code'),
  'conflict','archived category cannot be deactivated');
reset role;
select is((select count(*)::integer from public.article_categories where article_id=
  '81000000-0000-0000-0000-000000000005'),1,'denials preserve article category links');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select throws_ok($$ select * from public.list_admin_taxonomy('section') $$,
  '42501',null,'author cannot read administrator taxonomy directory');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select throws_ok($$ select * from public.list_admin_taxonomy('section',52) $$,
  '22023',null,'administrator taxonomy pages are bounded');
select is((select count(*)::integer from public.list_admin_taxonomy('section',1)),1,
  'administrator can read bounded taxonomy summary');
reset role;
select * from finish();
rollback;
