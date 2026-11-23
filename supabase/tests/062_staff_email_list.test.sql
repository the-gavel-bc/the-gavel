begin;
select no_plan();
create temp table audit_before as select count(*)::int n from public.audit_events
  where action in ('membership.invited','membership.invitation_changed',
    'membership.invitation_removed','membership.claimed');

update auth.users set email='list-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
update auth.users set email='list-author@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000002';
update auth.users set email='list-editor@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000003';
update public.memberships set role='editor'
where user_id='00000000-0000-0000-0000-000000000003';
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
select is(public.invite_staff('a0000000-0000-0000-0000-000000000015',
  '[{"email":"missing-role@bc.edu"}]'::jsonb)->>'code','invalid_input',
  'a missing role is a checked input error');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000016',
  '[{"email":"null-role@bc.edu","role":null}]'::jsonb)->>'code','invalid_input',
  'a null role is a checked input error');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000017',
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('email','format-name@bc.edu',
    'role','author','displayName',U&'Name\202ESpoof')))
  ->>'code','invalid_input','format characters are rejected in SQL invitation names');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000025',
  jsonb_build_array(jsonb_build_object('email','valid-staff-fixture@bc.edu','role','author'),
    jsonb_build_object('email','filler-staff-fixture@bc.edu','role','author','displayName',U&'Name\3164Spoof')))
  ->>'code','invalid_input','a batch with an invisible filler name is rejected atomically');
reset role;
select is((select count(*)::int from private.membership_invitations
  where email in ('valid-staff-fixture@bc.edu','filler-staff-fixture@bc.edu')),0,
  'the invalid mixed batch creates no listings');
insert into private.membership_write_receipts(actor_user_id,request_id,operation,payload_hash,result)
values('00000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000026','invite',
  private.membership_payload_hash(jsonb_build_object('operation','invite','entries',
    jsonb_build_array(jsonb_build_object('email','legacy-filler@bc.edu','role','author','displayName',U&'Name\3164Old')))),
  '{"ok":true,"added":1,"updated":0,"skipped":[],"replayed":false}'::jsonb);
set local role authenticated;
select is(public.invite_staff('a0000000-0000-0000-0000-000000000026',
  jsonb_build_array(jsonb_build_object('email','legacy-filler@bc.edu','role','author','displayName',U&'Name\3164Old'))),
  '{"ok":true,"added":1,"updated":0,"skipped":[],"replayed":true}'::jsonb,
  'an exact legacy invitation receipt with filler still replays');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000026',
  jsonb_build_array(jsonb_build_object('email','legacy-filler@bc.edu','role','author','displayName',U&'Other\3164Name')))
  ->>'code','request_conflict','changing a legacy invitation payload cannot reuse its receipt');
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
select is((select detail from public.audit_events where action='membership.invited'
  and resource_id=(select invitation_id from public.list_staff(51,'later'))),
  '{"role":"author"}'::jsonb,'new listing audit records its offered role');
select is((public.invite_staff('a0000000-0000-0000-0000-000000000006',
  '[{"email":"Listed.Person@bc.edu","role":"administrator"},
    {"email":"later@bc.edu","role":"author","displayName":"Later Person"},
    {"email":"list-author@bc.edu","role":"administrator"}]'::jsonb))->>'replayed',
  'true','an exact retry replays');
select is(public.invite_staff('a0000000-0000-0000-0000-000000000006',
  '[{"email":"other@bc.edu","role":"author"}]'::jsonb)->>'code','request_conflict',
  'a reused request id with different content conflicts');

create temp table staff_pages(page integer primary key,email text,key text);
grant select,insert on staff_pages to authenticated;
insert into staff_pages
select 1,email,key from public.list_staff(1,null,null,'invited')
order by email collate "C",key collate "C" limit 1;
insert into staff_pages
select 2,next_page.email,next_page.key
from staff_pages first_page
cross join lateral public.list_staff(1,null,null,'invited',first_page.email,first_page.key) next_page
where first_page.page=1;
select is((select count(*)::integer from staff_pages),2,
  'directory cursor returns the next invited person');
select ok((select email collate "C" < (select email collate "C" from staff_pages where page=2)
  from staff_pages where page=1),'directory pagination preserves email ordering');
create temp table later_invitation as
select invitation_id from public.list_staff(51,'later');
grant select on later_invitation to authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is(public.invite_staff('a0000000-0000-0000-0000-000000000009',
  '[{"email":"editor-add@bc.edu","role":"author"}]'::jsonb)->>'code','forbidden',
  'editor cannot add an invitation');
select throws_ok($$select * from public.list_staff()$$,'42501',null,
  'editor cannot list staff');
select throws_ok($$select * from public.staff_summary()$$,'42501',null,
  'editor cannot read staff counts');
select is(public.change_invitation_role(
  (select invitation_id from later_invitation),1,
  'a0000000-0000-0000-0000-000000000010','administrator')->>'code','forbidden',
  'editor cannot change an invitation target');
select is(public.remove_invitation(
  (select invitation_id from later_invitation),1,
  'a0000000-0000-0000-0000-000000000011')->>'code','forbidden',
  'editor cannot remove an invitation target');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);

select is((select pg_catalog.count(*)::int from public.list_staff(51,null,null,'invited')),
  2,'two people are listed');
select is((select state from public.list_staff(51,'later') limit 1),'invited',
  'search finds a listed person');
select is((select pg_catalog.count(*)::int from public.list_staff(51,null,'administrator')),
  2,'role filter shows the administrator members and listings');
select throws_ok($$select * from public.list_staff(20,null,'owner')$$,
  '22023',null,'role filtering rejects values outside the database enum');
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
select is((public.invite_staff('a0000000-0000-0000-0000-000000000020',
  '[{"email":"later@bc.edu","role":"administrator"}]'::jsonb)->'skipped'),
  '["later@bc.edu"]'::jsonb,'an unchanged listed address is reported as skipped');
select is((select detail from public.audit_events where action='membership.invitation_changed'
  and resource_id=(select invitation_id from public.list_staff(51,'later'))),
  '{"previousRole":"author","newRole":"administrator"}'::jsonb,
  'listed role change records previous and new roles');
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
select is((select detail from public.audit_events where action='membership.claimed'
  and resource_id='90000000-0000-0000-0000-000000000031'),
  '{"role":"administrator"}'::jsonb,'claim audit records the role actually applied');
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

-- A live listing cannot reactivate a membership retired by staff.
set local role authenticated;
select is((public.invite_staff('a0000000-0000-0000-0000-000000000018',
  '[{"email":"stale-listing@bc.edu","role":"author"}]'::jsonb)->>'added'),
  '1','invitation can predate an account');
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values('90000000-0000-0000-0000-000000000034','stale-listing@bc.edu',now(),
  '{"provider":"google","providers":["google"]}'::jsonb,'{}');
insert into public.profiles(auth_user_id,display_name,slug)
values('90000000-0000-0000-0000-000000000034','Stale Listing','stale-listing-person');
insert into public.memberships(user_id,role,active,approved_by,approved_at)
values('90000000-0000-0000-0000-000000000034','author',true,
  '00000000-0000-0000-0000-000000000004',now());
select throws_ok($$insert into private.membership_invitations(
  id,email,role,invited_by,claimed_user_id) values(
  '90000000-0000-0000-0000-000000000035','mismatch@bc.edu','author',
  '00000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000034')$$,
  '23514',null,'invitation claim identity and timestamp must move together');
select throws_ok($$insert into private.membership_invitations(
  id,email,role,invited_by,claimed_user_id,claimed_at,removed_at) values(
  '90000000-0000-0000-0000-000000000036','removed-claimed@bc.edu','author',
  '00000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000034',
  now(),now())$$,'23514',null,'a listing cannot be both claimed and removed');
set local role authenticated;
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000034',1,
  'a0000000-0000-0000-0000-000000000019')->>'ok'),'true',
  'deactivating a listed member succeeds');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000034',true);
select is(public.claim_invitation(),false,
  'the deactivated member cannot claim a stale live listing');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
reset role;
select ok((select not active from public.memberships
  where user_id='90000000-0000-0000-0000-000000000034'),
  'claim race leaves the deactivated membership inactive');
select ok((select removed_at is not null and claimed_user_id is null
  from private.membership_invitations where email='stale-listing@bc.edu'),
  'deactivation retires its live listing');
select is((select detail from public.audit_events where action='membership.invitation_removed'
  and correlation_id='a0000000-0000-0000-0000-000000000019'),
  '{"role":"author"}'::jsonb,'retired listing audit records its role');
select is((select pg_catalog.count(*)::int from public.audit_events
  where action='membership.invitation_removed'
    and correlation_id='a0000000-0000-0000-0000-000000000019'),1,
  'listing retirement is audited with the membership request');
set local role authenticated;
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000034',1,
  'a0000000-0000-0000-0000-000000000019')->>'replayed'),'true',
  'deactivation retry replays without another listing event');
reset role;
select is((select pg_catalog.count(*)::int from public.audit_events
  where action='membership.invitation_removed'
    and correlation_id='a0000000-0000-0000-0000-000000000019'),1,
  'exact retry does not duplicate listing retirement audit');
select is((select pg_catalog.count(*)::int from public.audit_events
  where correlation_id='a0000000-0000-0000-0000-000000000019'
    and action in ('membership.deactivated','membership.invitation_removed')),2,
  'exact retry preserves exactly the two initial mutation audit effects');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);

select is((select pg_catalog.count(*)::int from public.audit_events
  where action in ('membership.invited','membership.invitation_changed',
    'membership.invitation_removed','membership.claimed')) - (select n from audit_before),7,
  'listing changes and claims are audited');
-- Activity for one person includes events from before they signed in.
select is((select pg_catalog.count(*)::int from public.list_membership_audit_events(
  51,null,null,'90000000-0000-0000-0000-000000000031')),2,
  'one person sees their listing and claim events only');
select is((select pg_catalog.count(*)::int from public.list_membership_audit_events(
  51,null,null,'90000000-0000-0000-0000-0000000000ff')),0,'an unknown person has no events');
-- Simulate a pending pre-upgrade invitation with an unsafe old listing name.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values('a0000000-0000-0000-0000-000000000027','legacy-name-claim@bc.edu',now(),
  '{"provider":"google","providers":["google"]}'::jsonb,'{"full_name":"Supported Google Name"}'::jsonb);
insert into private.membership_invitations(email,role,display_name,invited_by)
values('legacy-name-claim@bc.edu','author',U&'Legacy\2800Name','00000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000027',true);
select ok(public.claim_invitation(),'a legacy listing can still be claimed');
reset role;
select is((select display_name from public.profiles where auth_user_id='a0000000-0000-0000-0000-000000000027'),
  'Supported Google Name','claim falls back to an eligible profile name');
select * from finish();
rollback;
