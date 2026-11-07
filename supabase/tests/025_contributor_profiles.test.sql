begin;
select no_plan();

select has_function('public','create_guest_contributor',
  array['uuid','text','text'],'guest create RPC exists');
select has_function('public','save_contributor_profile',
  array['uuid','integer','uuid','text','text'],'profile edit RPC exists');
select has_function('public','deactivate_contributor_profile',
  array['uuid','integer','uuid'],'profile deactivation RPC exists');
select ok(not has_column_privilege('authenticated','public.profiles','slug','UPDATE'),
  'direct slug update is closed');

update auth.users set email='task10-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((public.create_guest_contributor('80000000-0000-0000-0000-000000000951',
  'Guest Writer',null)->>'code'),'forbidden','author cannot create guest');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
create temp table task10_created as select public.create_guest_contributor(
  '80000000-0000-0000-0000-000000000952','Guest Writer','Plain biography') as value;
select is((select value->>'ok' from task10_created),'true','administrator creates guest');
select is((select value->>'slug' from task10_created),'guest-writer','slug is generated');
reset role;
select is((select auth_user_id::text from public.profiles where id=
  (select (value->>'profileId')::uuid from task10_created)),null::text,
  'guest has no Auth link');
set local role authenticated;
select is((public.create_guest_contributor('80000000-0000-0000-0000-000000000952',
  'Guest Writer','Plain biography')->>'replayed'),'true','exact create replays');
select is((public.create_guest_contributor('80000000-0000-0000-0000-000000000952',
  'Changed Writer',null)->>'code'),'request_conflict','changed create request fails');
select is((public.create_guest_contributor('80000000-0000-0000-0000-000000000967',
  'Guest Writer',null)->>'slug'),'guest-writer-2','name collision gets numeric suffix');
select is((public.create_guest_contributor('80000000-0000-0000-0000-000000000968',
  '😀',null)->>'slug'),'author','non-ASCII fallback is author');
select is((public.save_contributor_profile(
  (select (value->>'profileId')::uuid from task10_created),1,
  '80000000-0000-0000-0000-000000000953','Renamed Writer','New bio')->>'version'),
  '2','edit increments version');
select is((select slug from public.profiles where id=
  (select (value->>'profileId')::uuid from task10_created)),
  'renamed-writer','unpublished slug follows display name');
select is((public.save_contributor_profile(
  (select (value->>'profileId')::uuid from task10_created),1,
  '80000000-0000-0000-0000-000000000954','Stale Writer',null)->>'code'),
  'conflict','stale edit fails');
select is((public.save_contributor_profile(
  (select (value->>'profileId')::uuid from task10_created),2,
  '80000000-0000-0000-0000-000000000955','Renamed Writer','New bio')->>'changed'),
  'false','no-op leaves profile unchanged');
reset role;
insert into public.sections(id,name,slug)
  values('80000000-0000-0000-0000-000000000956','Task 10 section','task-10-section');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
  values('80000000-0000-0000-0000-000000000957',
    (select (value->>'profileId')::uuid from task10_created),
    '80000000-0000-0000-0000-000000000956','Published story','task-10-story',
    'published',now());
select ok((select slug_frozen from public.profiles where id=
  (select (value->>'profileId')::uuid from task10_created)),
  'publication freezes contributor slug');
set local role authenticated;
select is((public.save_contributor_profile(
  (select (value->>'profileId')::uuid from task10_created),2,
  '80000000-0000-0000-0000-000000000958','Later Name',null)->>'slug'),
  'renamed-writer','published contributor retains slug after rename');
select is((public.deactivate_contributor_profile(
  (select (value->>'profileId')::uuid from task10_created),3,
  '80000000-0000-0000-0000-000000000959')->>'code'),
  'conflict','published owner cannot deactivate');
reset role;
update public.articles set status='archived',archived_at=now()
  where id='80000000-0000-0000-0000-000000000957';
set local role authenticated;
select is((public.deactivate_contributor_profile(
  (select (value->>'profileId')::uuid from task10_created),3,
  '80000000-0000-0000-0000-000000000960')->>'code'),
  'conflict','archived owner cannot deactivate');
create temp table task10_credited as select public.create_guest_contributor(
  '80000000-0000-0000-0000-000000000964','Credited Guest',null) as value;
reset role;
update public.articles set status='published',archived_at=null
  where id='80000000-0000-0000-0000-000000000957';
insert into public.article_contributors(article_id,profile_id,contribution_role)
  values('80000000-0000-0000-0000-000000000957',
    (select (value->>'profileId')::uuid from task10_credited),'writer');
select ok((select slug_frozen from public.profiles where id=
  (select (value->>'profileId')::uuid from task10_credited)),
  'published credit freezes a contributor slug');
set local role authenticated;
select is((public.save_contributor_profile(
  (select (value->>'profileId')::uuid from task10_credited),1,
  '80000000-0000-0000-0000-000000000965','Later Credit Name',null)->>'slug'),
  'credited-guest','credited contributor retains published slug');
select is((public.deactivate_contributor_profile(
  (select (value->>'profileId')::uuid from task10_credited),2,
  '80000000-0000-0000-0000-000000000966')->>'code'),
  'conflict','published credit blocks deactivation');
reset role;
select is((select count(*)::integer from public.article_contributors where article_id=
  '80000000-0000-0000-0000-000000000957' and profile_id=
  (select (value->>'profileId')::uuid from task10_credited)),1,
  'denied deactivation leaves credit intact');
set local role authenticated;
select is((public.deactivate_contributor_profile(
  '10000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000961')->>'code'),
  'conflict','sole eligible administrator profile cannot be deactivated');
reset role;
update public.memberships set role='administrator'
  where user_id='00000000-0000-0000-0000-000000000002';
update auth.users set email='ineligible@example.test'
  where id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((public.deactivate_contributor_profile(
  '10000000-0000-0000-0000-000000000002',1,
  '80000000-0000-0000-0000-000000000969')->>'ok'),
  'true','ineligible administrator profile is not the last eligible admin');
reset role;
update auth.users set email='task10-author@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'::jsonb
  where id='00000000-0000-0000-0000-000000000002';
update public.memberships set role='author' where user_id='00000000-0000-0000-0000-000000000002';
update public.profiles set active=true where id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
create temp table task10_draft_guest as select public.create_guest_contributor(
  '80000000-0000-0000-0000-000000000962','Draft Guest',null) as value;
select is((public.deactivate_contributor_profile(
  (select (value->>'profileId')::uuid from task10_draft_guest),1,
  '80000000-0000-0000-0000-000000000963')->>'active'),
  'false','unreferenced guest can deactivate');
select is((public.deactivate_contributor_profile(
  (select (value->>'profileId')::uuid from task10_draft_guest),1,
  '80000000-0000-0000-0000-000000000963')->>'replayed'),
  'true','exact deactivation replays');
reset role;
select is((select count(*)::integer from public.audit_events where resource_type='profile'
  and resource_id=(select (value->>'profileId')::uuid from task10_created)),
  3,'only changed create and edits have profile audit events');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select throws_ok($$ select * from public.list_admin_contributors() $$,
  '42501',null,'author cannot enumerate admin contributor directory');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select throws_ok($$ select * from public.list_admin_contributors(52) $$,
  '22023',null,'directory rejects oversized page');
select ok((select count(*)>0 from public.list_admin_contributors(20,'all',null,null)),
  'administrator can read bounded contributor summaries');
select is((public.save_contributor_profile(
  (select (value->>'profileId')::uuid from task10_created),2,
  '80000000-0000-0000-0000-000000000958','Later Name',null)->>'replayed'),
  'true','exact edit replay retains result after archive');
reset role;

select * from finish();
rollback;
