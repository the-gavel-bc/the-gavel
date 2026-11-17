begin;
select no_plan();

update auth.users set email='list-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
update auth.users set email='list-author@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000002';
-- Signed in with Google but never approved, and one listed person.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values('90000000-0000-0000-0000-000000000031','Listed.Person@bc.edu',now(),
  '{"provider":"google","providers":["google"]}'::jsonb,'{"full_name":"Google Name"}'),
('90000000-0000-0000-0000-000000000032','stranger@bc.edu',now(),
  '{"provider":"google","providers":["google"]}'::jsonb,'{}'),
('90000000-0000-0000-0000-000000000033','mixed@bc.edu',now(),
  '{"provider":"google","providers":["google","email"]}'::jsonb,'{}');

select ok(not has_function_privilege('anon','public.invite_staff(uuid,jsonb)','EXECUTE'),
  'anonymous cannot add staff');
select ok(not has_function_privilege('anon','public.claim_invitation()','EXECUTE'),
  'anonymous cannot claim');
select hasnt_function('public','list_membership_candidates',
  array['integer','text','text','uuid'],'pending-approval directory is retired');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.invite_staff('a0000000-0000-0000-0000-000000000001',
  '[{"email":"x@bc.edu","role":"author"}]'::jsonb)->>'code','forbidden',
  'author cannot add staff');
select throws_ok($$select * from public.list_staff()$$,'42501',null,
  'author cannot list staff');
select throws_ok($$select * from public.staff_summary()$$,'42501',null,
  'author cannot read staff counts');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.invite_staff('a0000000-0000-0000-0000-000000000002',
  '[{"email":"x@gmail.com","role":"author"}]'::jsonb)->>'code','invalid_input',
  'only bc.edu addresses can be listed');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000003',
  '[{"email":"a@bc.edu","role":"owner"}]'::jsonb)->>'code','invalid_input',
  'unknown roles are rejected');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000004',
  '[{"email":"a@bc.edu","role":"author"},{"email":"A@bc.edu","role":"author"}]'::jsonb)
  ->>'code','invalid_input','duplicate addresses in one request are rejected');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000005','[]'::jsonb)
  ->>'code','invalid_input','an empty list is rejected');

select is((public.invite_staff('a0000000-0000-0000-0000-000000000006',
  '[{"email":"Listed.Person@bc.edu","role":"administrator"},
    {"email":"later@bc.edu","role":"author","displayName":"Later Person"},
    {"email":"list-author@bc.edu","role":"administrator"}]'::jsonb))
  - 'replayed','{"ok":true,"added":2,"updated":0,"skipped":["list-author@bc.edu"]}'::jsonb,
  'adds new addresses, skips people who are already members');
select is((public.invite_staff('a0000000-0000-0000-0000-000000000006',
  '[{"email":"Listed.Person@bc.edu","role":"administrator"},
    {"email":"later@bc.edu","role":"author","displayName":"Later Person"},
    {"email":"list-author@bc.edu","role":"administrator"}]'::jsonb))->>'replayed',
  'true','an exact retry replays');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000006',
  '[{"email":"other@bc.edu","role":"author"}]'::jsonb)->>'code','request_conflict',
  'a reused request id with different content conflicts');

select is((select pg_catalog.count(*)::int from public.list_staff(51,null,null,'invited')),
  2,'two people are listed');
select is((select state from public.list_staff(51,'later') limit 1),'invited',
  'search finds a listed person');
select is((select pg_catalog.count(*)::int from public.list_staff(51,null,'administrator')),
  2,'role filter shows the administrator members and listings');
select is((select pg_catalog.count(*)::int from public.list_staff(51,'100%')),0,
  'search treats wildcard characters literally');
select throws_ok($$select * from public.list_staff(52)$$,'22023',null,'page size is bounded');
select throws_ok($$select * from public.list_staff(20,null,null,'pending')$$,'22023',null,
  'pending is no longer a state');
select throws_ok($$select * from public.list_staff(20,null,null,'all','a@bc.edu',null)$$,
  '22023',null,'partial cursor is rejected');
select is((select invited from public.staff_summary()),2,'summary counts listings');

-- Role of a listed person can change until they sign in.
select is((public.change_invitation_role(
  (select invitation_id from public.list_staff(51,'later')),1,
  'a0000000-0000-0000-0000-000000000007','administrator'))->>'version','2',
  'listed role can change');
select is(public.change_invitation_role(
  (select invitation_id from public.list_staff(51,'later')),1,
  'a0000000-0000-0000-0000-000000000008','author')->>'code','conflict',
  'stale version conflicts');

-- Sign-in claims.
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000032',true);
select is(public.claim_invitation(),false,'an unlisted person claims nothing');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000033',true);
select is(public.claim_invitation(),false,'a mixed-provider identity claims nothing');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000031',true);
select is(public.claim_invitation(),true,'the listed person claims their role');
select is(public.claim_invitation(),false,'a second claim does nothing');
reset role;
select is((select role::text from public.memberships
  where user_id='90000000-0000-0000-0000-000000000031'),'administrator',
  'the listed role applies');
select is((select display_name from public.profiles
  where auth_user_id='90000000-0000-0000-0000-000000000031'),'Google Name',
  'name comes from the Google profile when none was listed');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select pg_catalog.count(*)::int from public.list_staff(51,null,null,'invited')),
  1,'claimed listing leaves the invited view');
select is((public.remove_invitation(
  (select invitation_id from public.list_staff(51,'later')),2,
  'a0000000-0000-0000-0000-000000000009'))->>'ok','true','a listing can be removed');
select is((select pg_catalog.count(*)::int from public.list_staff(51,null,null,'invited')),
  0,'removed listing is gone');
reset role;

select is((select pg_catalog.count(*)::int from public.audit_events
  where action in ('membership.invited','membership.invitation_changed',
    'membership.invitation_removed','membership.claimed')),5,
  'listing changes and claims are audited');
select * from finish();
rollback;
