begin;
select no_plan();

-- The seeded administrator is not a Google bc.edu identity on a fresh
-- database; make it one so it passes the eligibility check.
update auth.users set email='moderation-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id='00000000-0000-0000-0000-000000000004';

create temp table reader_fixture as select gen_random_uuid() user_id;
grant select on reader_fixture to authenticated,anon;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
select user_id,'reader-'||left(user_id::text,8)||'@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb
from reader_fixture;
insert into public.profiles(id,auth_user_id,display_name,slug)
select user_id,user_id,'Synthetic Reader','reader-'||left(user_id::text,8) from reader_fixture;
insert into public.memberships(user_id,role,active,approved_by,approved_at)
select user_id,'author',true,'00000000-0000-0000-0000-000000000004',now() from reader_fixture;

select has_function('public','get_member_profile_moderation',array['uuid']);

set local role anon;
select throws_ok($$select public.get_member_profile_moderation((select user_id from reader_fixture))$$,
  '42501',null,'anon cannot call the moderation reader');
reset role;

select set_config('request.jwt.claim.sub',(select user_id::text from reader_fixture),true);
set local role authenticated;
select is(public.get_member_profile_moderation((select user_id from reader_fixture)),null,
  'a non-administrator gets nothing, even for their own profile');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(public.get_member_profile_moderation((select user_id from reader_fixture)),
  '{"version":1,"hidden":false}'::jsonb,'an active administrator reads version and visibility');
select is(public.get_member_profile_moderation(gen_random_uuid()),null,'an unknown member returns null');
reset role;

select * from finish();
rollback;
