begin;
select no_plan();
select has_function('public','get_own_public_profile',array[]::text[],
  'own profile reader exists');
select has_function('public','save_own_public_profile',
  array['integer','uuid','text','text'],'own profile save exists');
select ok(not has_column_privilege('authenticated','public.profiles','slug','UPDATE'),
  'direct slug updates remain closed');
select ok(not has_function_privilege('anon','public.save_own_public_profile(integer,uuid,text,text)','EXECUTE'),
  'anonymous cannot execute own profile save');
select hasnt_function('public','save_own_public_profile',array['uuid','integer','uuid','text','text'],
  'save accepts no target profile ID');
-- The seeded author may already own published articles and have a frozen
-- slug. Use a new member to exercise the transition from mutable to frozen.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
values ('82000000-0000-0000-0000-000000000010','own-profile-fixture@bc.edu',now(),
  '{"provider":"google"}'::jsonb);
insert into public.profiles(id,auth_user_id,display_name,slug)
values ('82000000-0000-0000-0000-000000000011','82000000-0000-0000-0000-000000000010',
  'Own Profile Fixture','own-profile-fixture');
insert into public.memberships(user_id,role,active,approved_by,approved_at)
values ('82000000-0000-0000-0000-000000000010','author',true,
  '00000000-0000-0000-0000-000000000004',now());
update auth.users set email='own-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'::jsonb
  where id in ('00000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.get_own_public_profile()),0,'inactive membership cannot read');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000001','Denied',null)->>'code'),
  'forbidden','inactive membership cannot save');
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000010',true);
select is((select count(*)::integer from public.get_own_public_profile()),1,'active author reads only own profile');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000002','Own Profile Fixture Writer','Public bio')->>'version'),
  '2','own edit increments version');
select is((select slug from public.get_own_public_profile()),'own-profile-fixture-writer','unpublished slug follows name');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000002','Own Profile Fixture Writer','Public bio')->>'replayed'),
  'true','exact save retries');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000002','Different',null)->>'code'),
  'request_conflict','request ID cannot be reused with changed payload');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000003','Stale',null)->>'code'),
  'conflict','stale version cannot overwrite');
select is((public.save_own_public_profile(2,'82000000-0000-0000-0000-000000000004','Own Profile Fixture Writer','Public bio')->>'changed'),
  'false','unchanged save is a no-op');
select is((public.save_own_public_profile(2,'82000000-0000-0000-0000-000000000005',' Bad ',null)->>'code'),
  'invalid_input','untrimmed name rejected');
reset role;
select isnt((select display_name from public.profiles where id='10000000-0000-0000-0000-000000000003'),
  'Own Profile Fixture Writer','another profile is unchanged');
select is((select count(*)::integer from public.audit_events where resource_type='profile'
  and resource_id='82000000-0000-0000-0000-000000000011'),1,'only changed save writes an audit');
insert into public.sections(id,name,slug) values('82000000-0000-0000-0000-000000000006','Own test section','own-test-section');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
  values('82000000-0000-0000-0000-000000000007','82000000-0000-0000-0000-000000000011',
    '82000000-0000-0000-0000-000000000006','Own story','own-test-story','published',now());
set local role authenticated;
select is((public.save_own_public_profile(2,'82000000-0000-0000-0000-000000000008','Published Name',null)->>'slug'),
  'own-profile-fixture-writer','own published slug remains frozen');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from public.get_own_public_profile()),1,'administrator reads their own profile only');
reset role;
update auth.users set email_confirmed_at=null where id='82000000-0000-0000-0000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000010',true);
select is((select count(*)::integer from public.get_own_public_profile()),0,'ineligible user cannot read');
select is((public.save_own_public_profile(3,'82000000-0000-0000-0000-000000000009','Denied',null)->>'code'),
  'forbidden','ineligible user cannot save');
reset role;
select * from finish();
rollback;
