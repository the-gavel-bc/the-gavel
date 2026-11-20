begin;
select no_plan();

update auth.users set email='membership-' || right(id::text,1) || '@bc.edu',
  email_confirmed_at=now(),raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004');
update public.memberships set role='editor'
where user_id='00000000-0000-0000-0000-000000000003';
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
  ('90000000-0000-0000-0000-000000000005','new5@bc.edu',now(),
    '{"provider":"google","providers":["google"]}'::jsonb,'{}'),
  ('90000000-0000-0000-0000-000000000006','new6@bc.edu',now(),
    '{"provider":"google","providers":["google"]}'::jsonb,'{}');
insert into public.profiles(display_name,slug) values('Guest contributor','new-member');

select has_function('public','approve_membership',
  array['uuid','uuid','app_role','text','integer'],'approval RPC exists');
select ok(not has_function_privilege('anon',
  'public.approve_membership(uuid,uuid,public.app_role,text,integer)','EXECUTE'),
  'anonymous cannot call approval');
select ok(not has_table_privilege('authenticated','public.memberships','INSERT'),
  'direct membership insert revoked');
select ok(not has_table_privilege('authenticated','public.memberships','UPDATE'),
  'direct membership update revoked');
select ok(not has_table_privilege('authenticated','public.memberships','DELETE'),
  'direct membership delete revoked');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000901','author','New Member',1)->>'code'),
  'forbidden','author cannot approve');
reset role;
select is((select count(*)::integer from public.memberships where user_id=
  '90000000-0000-0000-0000-000000000005'),0,'denied approval creates no membership');

-- Editors may review articles but have no staff administration authority.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000924','author','Editor Target',1)->>'code'),
  'forbidden','editor cannot approve a membership');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000925','author')->>'code'),
  'forbidden','editor cannot change an administrator role');
select is((public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000926')->>'code'),
  'forbidden','editor cannot deactivate an administrator');
reset role;

update auth.users set raw_app_meta_data='{"provider":"email"}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000920','author','New Member',1)->>'code'),
  'forbidden','ineligible administrator cannot approve');
reset role;
update auth.users set raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000921','author','New Member',1)->>'code'),
  'forbidden','inactive administrator cannot approve');
reset role;
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000004';
update auth.users set email_confirmed_at=null where id='90000000-0000-0000-0000-000000000006';
set local role authenticated;
select is((public.approve_membership('90000000-0000-0000-0000-000000000006',
  '80000000-0000-0000-0000-000000000923','author','Second Admin',1)->>'code'),
  'invalid_input','unconfirmed target cannot be approved');
reset role;
update auth.users set email_confirmed_at=now() where id='90000000-0000-0000-0000-000000000006';
insert into public.memberships(user_id,role,active,approved_by,approved_at)
values('90000000-0000-0000-0000-000000000006','author',false,
  '00000000-0000-0000-0000-000000000004',now());

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is((public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000902')->>'code'),
  'last_administrator','sole eligible administrator cannot deactivate self');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000903','author')->>'code'),
  'last_administrator','sole eligible administrator cannot demote self');
select is((public.approve_membership('90000000-0000-0000-0000-000000000006',
  '80000000-0000-0000-0000-000000000927','author',U&'Name\202ESpoof',1)->>'code'),
  'invalid_input','membership approval rejects Unicode format characters');
reset role;
insert into private.membership_write_receipts(
  actor_user_id,request_id,operation,target_user_id,payload_hash,result)
values('00000000-0000-0000-0000-000000000004',
  '80000000-0000-0000-0000-000000000932','approve',
  '90000000-0000-0000-0000-000000000005',
  private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','approve','target','90000000-0000-0000-0000-000000000005'::uuid,
    'expectedVersion',null,'role','author'::public.app_role,
    'displayName','Legacy Member')),
  '{"ok":true,"targetUserId":"90000000-0000-0000-0000-000000000005",
    "role":"author","active":true,"version":1,"changed":true,"replayed":false}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000932','author','Legacy Member')->>'replayed'),
  'true','exact legacy null-version receipt still replays');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000930','author','Unlisted Member')->>'code'),
  'invalid_input','legacy null-version approval is rejected');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000931','author','Unlisted Member',1)->>'code'),
  'not_found','approval cannot create an unlisted membership');
reset role;
insert into public.memberships(user_id,role,active,approved_by,approved_at)
values('90000000-0000-0000-0000-000000000005','author',false,
  '00000000-0000-0000-0000-000000000004',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000904','author','New Member',1)->>'ok'),
  'true','administrator reactivates an existing signed-in member');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000904','author','New Member',1)->>'replayed'),
  'true','exact request replays original result');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000904','administrator','New Member',1)->>'code'),
  'request_conflict','changed request cannot reuse receipt');
reset role;
select is((select role::text from public.memberships where user_id=
  '90000000-0000-0000-0000-000000000005'),'author','approval stores requested role');
select is((select slug from public.profiles where auth_user_id=
  '90000000-0000-0000-0000-000000000005'),'new-member-2',
  'profile slug handles an existing guest collision');
select is((select count(*)::integer from public.audit_events where
  resource_type='membership' and resource_id='90000000-0000-0000-0000-000000000005'),
  1,'approval emits exactly one membership audit');
select is((select pg_catalog.to_jsonb(e)->'detail' from public.audit_events e
  where action='membership.reactivated' and resource_id='90000000-0000-0000-0000-000000000005'),
  '{"previousRole":"author","newRole":"author"}'::jsonb,
  'reactivation records the prior role and granted role');
select ok((select active and approved_at is not null and approved_by=
  '00000000-0000-0000-0000-000000000004' and revoked_at is null
  from public.memberships where user_id='90000000-0000-0000-0000-000000000005'),
  'approval records trusted approver and timestamps');

set local role authenticated;
select is((public.change_membership_role('90000000-0000-0000-0000-000000000005',2,
  '80000000-0000-0000-0000-000000000905','administrator')->>'version'),
  '3','role change increments version');
select is((select pg_catalog.to_jsonb(e)->'detail' from public.audit_events e
  where action='membership.role_changed' and resource_id='90000000-0000-0000-0000-000000000005'),
  '{"previousRole":"author","newRole":"administrator"}'::jsonb,
  'role change records distinct previous and new roles');
select is((public.change_membership_role('90000000-0000-0000-0000-000000000005',2,
  '80000000-0000-0000-0000-000000000906','author')->>'code'),
  'conflict','stale role change cannot overwrite');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000907','author')->>'ok'),
  'true','self-demotion succeeds after another eligible administrator exists');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000907','author')->>'replayed'),
  'true','self-demoted actor can replay only own exact receipt');
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',3,
  '80000000-0000-0000-0000-000000000908')->>'code'),
  'forbidden','former administrator cannot issue a new mutation');
reset role;

select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000005',true);
set local role authenticated;
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',3,
  '80000000-0000-0000-0000-000000000909')->>'code'),
  'last_administrator','new sole administrator cannot deactivate self');
select is((public.approve_membership('90000000-0000-0000-0000-000000000006',
  '80000000-0000-0000-0000-000000000910','administrator','Second Admin',1)->>'ok'),
  'true','new administrator can approve another');
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',3,
  '80000000-0000-0000-0000-000000000911')->>'ok'),
  'true','self-deactivation succeeds when another remains');
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',3,
  '80000000-0000-0000-0000-000000000911')->>'replayed'),
  'true','self-deactivated actor can replay exact receipt');
reset role;
select ok((select not active and revoked_at is not null and approved_at is not null
  from public.memberships where user_id='90000000-0000-0000-0000-000000000005'),
  'deactivation preserves approval and records revocation');
select is((select count(*)::integer from public.audit_events where
  resource_type='membership' and action='membership.deactivated' and
  resource_id='90000000-0000-0000-0000-000000000005'),1,
  'deactivation emits one audit event');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000006',true);
set local role authenticated;
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000928','author','Reactivated Member',4)->>'ok'),
  'true','another administrator explicitly reactivates a member');
select is((select count(*)::integer from public.audit_events
  where action='membership.reactivated' and resource_id='90000000-0000-0000-0000-000000000005'),2,
  'reactivation is a distinct audit action');
select is((select pg_catalog.to_jsonb(e)->'detail' from public.audit_events e
  where action='membership.reactivated' and resource_id='90000000-0000-0000-0000-000000000005'
    and correlation_id='80000000-0000-0000-0000-000000000928'),
  '{"previousRole":"administrator","newRole":"author"}'::jsonb,
  'reactivation records prior and granted roles');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000928','author','Reactivated Member',4)->>'replayed'),
  'true','reactivation exact retry replays');
reset role;
select is((select count(*)::integer from public.audit_events
  where action='membership.reactivated' and resource_id='90000000-0000-0000-0000-000000000005'),2,
  'reactivation retry does not duplicate audit history');

select * from finish();
rollback;
