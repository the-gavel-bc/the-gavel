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
update auth.users set email='own-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'::jsonb
  where id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.get_own_public_profile()),0,'inactive membership cannot read');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000001','Denied',null)->>'code'),
  'forbidden','inactive membership cannot save');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.get_own_public_profile()),1,'active author reads only own profile');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000002','Own Writer','Public bio')->>'version'),
  '2','own edit increments version');
select is((select slug from public.get_own_public_profile()),'own-writer','unpublished slug follows name');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000002','Own Writer','Public bio')->>'replayed'),
  'true','exact save retries');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000002','Different',null)->>'code'),
  'request_conflict','request ID cannot be reused with changed payload');
select is((public.save_own_public_profile(1,'82000000-0000-0000-0000-000000000003','Stale',null)->>'code'),
  'conflict','stale version cannot overwrite');
select is((public.save_own_public_profile(2,'82000000-0000-0000-0000-000000000004','Own Writer','Public bio')->>'changed'),
  'false','unchanged save is a no-op');
select is((public.save_own_public_profile(2,'82000000-0000-0000-0000-000000000005',' Bad ',null)->>'code'),
  'invalid_input','untrimmed name rejected');
reset role;
select isnt((select display_name from public.profiles where id='10000000-0000-0000-0000-000000000003'),
  'Own Writer','another profile is unchanged');
select is((select count(*)::integer from public.audit_events where resource_type='profile'
  and resource_id='10000000-0000-0000-0000-000000000002'),1,'only changed save writes an audit');
insert into public.sections(id,name,slug) values('82000000-0000-0000-0000-000000000006','Own test section','own-test-section');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
  values('82000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000006','Own story','own-test-story','published',now());
set local role authenticated;
select is((public.save_own_public_profile(2,'82000000-0000-0000-0000-000000000008','Published Name',null)->>'slug'),
  'own-writer','own published slug remains frozen');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from public.get_own_public_profile()),1,'administrator reads their own profile only');
reset role;
update auth.users set email_confirmed_at=null where id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.get_own_public_profile()),0,'ineligible user cannot read');
select is((public.save_own_public_profile(3,'82000000-0000-0000-0000-000000000009','Denied',null)->>'code'),
  'forbidden','ineligible user cannot save');
reset role;
select * from finish();
rollback;
