begin;
select no_plan();

update auth.users set email='directory-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
update auth.users set email='directory-author@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000002';
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values('90000000-0000-0000-0000-000000000021','0-task9-pending@bc.edu',now(),
  '{"provider":"google","providers":["google"]}'::jsonb,'{}');

select has_function('public','list_membership_candidates',
  array['integer','text','text','uuid'],'bounded member directory exists');
select ok(not has_function_privilege('anon',
  'public.list_membership_candidates(integer,text,text,uuid)','EXECUTE'),
  'anonymous cannot execute member directory');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select throws_ok($$select * from public.list_membership_candidates()$$,'42501',null,
  'author cannot list member identities');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select state from public.list_membership_candidates(51,'pending')
  where user_id='90000000-0000-0000-0000-000000000021'),'pending',
  'eligible signed-in person without membership is visible for approval');
select is((select email from public.list_membership_candidates(51,'pending')
  where user_id='90000000-0000-0000-0000-000000000021'),
  '0-task9-pending@bc.edu','admin sees safe target email');
select is((select state from public.list_membership_candidates(51,'active')
  where user_id='00000000-0000-0000-0000-000000000002'),'active',
  'active filter includes existing member');
select throws_ok($$select * from public.list_membership_candidates(52)$$,
  '22023',null,'direct directory call is bounded');
select throws_ok($$select * from public.list_membership_candidates(20,'deleted')$$,
  '22023',null,'unknown state is rejected');
select throws_ok($$select * from public.list_membership_candidates(
  20,'all','a@bc.edu',null)$$,'22023',null,'partial cursor is rejected');
reset role;

select * from finish();
rollback;
